import { useEffect, useState } from 'react';
import { api } from './api';
import { useFeatures, useFlow } from './features';
import { MessageTemplates } from './MessageTemplates';
import { OrderEdit } from './OrderEdit';
import { alertDialog, confirmDialog, tg } from './telegram';
import { reliabilityBadge, slotText, type Order } from './types';

interface Props {
  order: Order;
  onBack: () => void;
  onChanged: (updated: Order) => void;
}

export function OrderDetail({ order, onBack, onChanged }: Props) {
  const withTemplates = useFeatures().messaging.templatesEnabled;
  const flow = useFlow();
  const editable = flow.editableIds().includes(order.status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);

  // Formulaire d'annulation (raison + no-show), affiche a la demande.
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [noShow, setNoShow] = useState(false);

  useEffect(() => {
    const back = tg?.BackButton;
    if (!back) return;
    back.show();
    back.onClick(onBack);
    return () => {
      back.offClick(onBack);
      back.hide();
    };
  }, [onBack]);

  async function apply(to: string, opts?: { reason?: string; no_show?: boolean }) {
    setBusy(true);
    try {
      const { order: updated } = await api.setStatus(order.id, to, opts);
      if (updated) {
        onChanged(updated);
        tg?.HapticFeedback?.notificationOccurred('success');
      }
      setCancelling(false);
    } catch (e) {
      alertDialog(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function onStatusClick(to: string, label: string) {
    if (to === 'cancelled') {
      setCancelling(true);
      return;
    }
    if (await confirmDialog(`${label} ?\nLe client sera notifie.`)) void apply(to);
  }

  async function send() {
    const text = message.trim();
    if (!text) return;
    setBusy(true);
    try {
      await api.sendMessage(order.id, text);
      setMessage('');
      alertDialog('Message envoye au client.');
    } catch (e) {
      alertDialog(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const badge = reliabilityBadge(order.customer.reliability, order.customer.blocked);
  const rel = order.customer.reliability;

  if (editing) {
    return (
      <OrderEdit
        order={order}
        onCancel={() => setEditing(false)}
        onDone={(updated) => {
          setEditing(false);
          onChanged(updated);
        }}
      />
    );
  }

  return (
    <>
      <button className="back" onClick={onBack}>
        &larr; Retour
      </button>

      <div className="row">
        <h1>Commande #{order.id}</h1>
        <span className="badge" data-role={flow.role(order.status)}>{flow.label(order.status)}</span>
      </div>

      {editable && (
        <button className="btn secondary" onClick={() => setEditing(true)} style={{ marginBottom: 12 }}>
          ✏️ Modifier la commande
        </button>
      )}

      {(badge || order.customer.blocked) && (
        <div className={`notice ${order.customer.blocked ? 'notice--danger' : 'notice--warning'}`}>
          {order.customer.blocked
            ? '🚫 Client sur liste noire'
            : rel
              ? `⚠️ ${rel.delivered} livrées / ${rel.noShow} no-show`
              : badge}
        </div>
      )}

      {(order.customer.loyalty?.rewardsAvailable ?? 0) > 0 && (
        <div className="notice notice--success">
          🎁 Récompense fidélité disponible pour ce client
        </div>
      )}

      <div className="card">
        <ul className="items">
          {order.items.map((l) => (
            <li key={`${l.catId}:${l.prodId}:${l.variantId ?? ''}`}>
              <span className="it-name">{l.label}</span>
              <span className="it-qty">{l.qty} &times;</span>
              <span>{l.price * l.qty} EUR</span>
            </li>
          ))}
        </ul>
        {(order.referral_discount ?? 0) > 0 && (
          <div className="row muted small">
            <span>Réduction parrainage</span>
            <span>-{order.referral_discount} EUR</span>
          </div>
        )}
        <div className="row total">
          <span>Total</span>
          <span>{order.total} EUR</span>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <div className="label">Client</div>
          {order.customer.name || (order.username ? `@${order.username}` : `id ${order.user_id}`)}
        </div>
        {order.phone && (
          <div className="field">
            <div className="label">Telephone</div>
            <a className="tel" href={`tel:${order.phone.replace(/\s/g, '')}`}>
              {order.phone}
            </a>
          </div>
        )}
        <div className="field">
          <div className="label">Adresse</div>
          {order.address ?? 'Retrait en boutique'}
        </div>
        {(order.delivery_note || order.customer.delivery_note) && (
          <div className="field">
            <div className="label">Précision de livraison</div>
            {order.delivery_note || order.customer.delivery_note}
          </div>
        )}
        <div className="field">
          <div className="label">Creneau souhaite</div>
          🕒 {slotText(order.route)}
        </div>
        <div className="field">
          <div className="label">Passee le</div>
          {order.created_at} UTC
        </div>
        {order.cancellation_reason && (
          <div className="field">
            <div className="label">Raison d'annulation{order.no_show ? ' (no-show)' : ''}</div>
            {order.cancellation_reason}
          </div>
        )}
      </div>

      {cancelling ? (
        <div className="card">
          <div className="label" style={{ marginBottom: 6 }}>
            Annuler la commande
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Raison (rupture de stock, client injoignable...)"
          />
          <label className="checkbox">
            <input type="checkbox" checked={noShow} onChange={(e) => setNoShow(e.target.checked)} />
            Imputer au client (compte comme no-show)
          </label>
          <div className="actions">
            <button
              className="btn"
              disabled={busy}
              onClick={() => void apply('cancelled', { reason: reason.trim() || undefined, no_show: noShow })}
            >
              Confirmer l'annulation
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => setCancelling(false)}>
              Retour
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {order.next.map((s) => (
            <button
              key={s.to}
              className={`btn ${s.to === 'cancelled' ? 'secondary' : ''}`}
              disabled={busy}
              onClick={() => void onStatusClick(s.to, s.label)}
            >
              {s.label}
            </button>
          ))}
          {order.next.length === 0 && (
            <p className="muted">Aucune action possible (statut final).</p>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="label" style={{ marginBottom: 6 }}>
          Message libre au client (via le bot)
        </div>
        {withTemplates && <MessageTemplates onPick={setMessage} />}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex : il nous manque un ingredient, on remplace par..."
        />
        <button
          className="btn secondary"
          disabled={busy || !message.trim()}
          onClick={() => void send()}
          style={{ marginTop: 8 }}
        >
          Envoyer le message
        </button>
      </div>
    </>
  );
}
