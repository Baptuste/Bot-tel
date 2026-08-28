import { useEffect, useState } from 'react';
import { api } from './api';
import { alertDialog, tg } from './telegram';
import { STATUS_LABEL, type Customer, type Order, type Reliability } from './types';

interface Props {
  userId: number;
  onBack: () => void;
}

export function CustomerDetail({ userId, onBack }: Props) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [reliability, setReliability] = useState<Reliability | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    setError(null);
    try {
      const d = await api.customers.get(userId);
      setCustomer(d.customer);
      setReliability(d.reliability);
      setOrders(d.orders);
      setName(d.customer.name ?? '');
      setNote(d.customer.delivery_note ?? '');
      setNotes(d.customer.notes ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
    const back = tg?.BackButton;
    if (!back) return;
    back.show();
    back.onClick(onBack);
    return () => {
      back.offClick(onBack);
      back.hide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, onBack]);

  async function patch(p: Parameters<typeof api.customers.update>[1]) {
    setBusy(true);
    try {
      await api.customers.update(userId, p);
      await load();
    } catch (e) {
      alertDialog(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="error">{error}</div>;
  if (!customer || !reliability) return <p className="muted">Chargement...</p>;

  const rate = reliability.rate === null ? '—' : `${Math.round(reliability.rate * 100)}%`;

  return (
    <>
      <button className="back" onClick={onBack}>
        &larr; Retour
      </button>
      <div className="row">
        <h1>{customer.name || (customer.username ? `@${customer.username}` : `#${customer.user_id}`)}</h1>
        {customer.blocked && <span className="badge cancelled">bloqué</span>}
      </div>

      <div className="card">
        <div className="field">
          <div className="label">Nom complet</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex : Jean Dupont" />
        </div>
        <div className="field">
          <div className="label">Instruction de livraison</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="étage, code d'accès..." />
        </div>
        <div className="field">
          <div className="label">Notes internes (admin)</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => void patch({ name, delivery_note: note, notes })}
        >
          Enregistrer
        </button>
      </div>

      <div className="card">
        <div className="field">
          <span className="muted">@{customer.username ?? '—'}</span> · id {customer.user_id}
        </div>
        <div className="field">Tél : {customer.phone ?? '—'}</div>
        <div className="field">Adresse : {customer.address ?? '—'}</div>
        <div className="field muted small">Client depuis le {customer.first_seen} UTC</div>
      </div>

      <div className="card">
        <div className="label" style={{ marginBottom: 6 }}>
          Fiabilité
        </div>
        <div className="rel-grid">
          <div>
            <strong>{reliability.delivered}</strong>
            <div className="muted small">livrées</div>
          </div>
          <div>
            <strong>{reliability.noShow}</strong>
            <div className="muted small">no-show</div>
          </div>
          <div>
            <strong>{reliability.cancelledOther}</strong>
            <div className="muted small">annul. légit.</div>
          </div>
          <div>
            <strong>{rate}</strong>
            <div className="muted small">taux</div>
          </div>
        </div>
        <button
          className={`btn ${customer.blocked ? 'secondary' : ''}`}
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() => void patch({ blocked: !customer.blocked })}
        >
          {customer.blocked ? 'Débloquer le client' : '🚫 Bloquer (liste noire)'}
        </button>
      </div>

      <div className="card">
        <div className="label" style={{ marginBottom: 6 }}>
          Historique ({orders.length})
        </div>
        {orders.map((o) => (
          <div key={o.id} className="variant-row">
            <span>
              #{o.id} <span className="muted">{o.created_at.slice(0, 10)}</span>
            </span>
            <span className={`badge ${o.status}`}>{STATUS_LABEL[o.status]}</span>
          </div>
        ))}
      </div>
    </>
  );
}
