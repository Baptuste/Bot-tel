import { useEffect, useMemo, useState } from 'react';
import { useBackButton, useMainButton } from './hooks';
import { shop } from './api';
import { tap } from '../telegram';
import type { CartDto, ShopConfig, Slot } from './types';

interface Props {
  config: ShopConfig;
  cart: CartDto;
  onDone: (orderId: number) => void;
  onItemsChanged: (removed: string[]) => void;
  onBack: () => void;
}

export function Checkout({ config, cart, onDone, onItemsChanged, onBack }: Props) {
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [routeId, setRouteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useBackButton(onBack);

  useEffect(() => {
    Promise.all([shop.lastOrder(), config.deliverySlots.enabled ? shop.slots() : { slots: [] }])
      .then(([last, s]) => {
        if (last.address) setAddress(last.address);
        if (last.phone) setPhone(last.phone);
        if (last.deliveryNote) setNote(last.deliveryNote);
        setSlots(s.slots);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [config.deliverySlots.enabled]);

  const needsSlot = config.deliverySlots.enabled && slots.length > 0;
  const ready = useMemo(() => {
    if (config.requiresAddress && !address.trim()) return false;
    if (config.requiresPhone && !phone.trim()) return false;
    if (needsSlot && routeId == null) return false;
    return true;
  }, [config.requiresAddress, config.requiresPhone, needsSlot, address, phone, routeId]);

  async function submit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    setErr('');
    try {
      const { orderId } = await shop.placeOrder({
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        routeId,
        deliveryNote: note.trim() || null,
      });
      onDone(orderId);
    } catch (e) {
      const info = (e as { info?: { error?: string; removed?: string[] } }).info;
      if (info?.error === 'items_changed') {
        onItemsChanged(info.removed ?? []);
        return;
      }
      setErr(
        info?.error === 'missing_info'
          ? 'Il manque une information de livraison.'
          : info?.error === 'empty'
            ? 'Ton panier est vide.'
            : "La commande n'a pas pu être envoyée. Réessaie.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  useMainButton({
    text: `Commander · ${cart.total} €`,
    onClick: submit,
    visible: !loading,
    loading: submitting || !ready,
  });

  if (loading) {
    return (
      <div className="shop shop-state">
        <p className="shop-state__text">Un instant…</p>
      </div>
    );
  }

  const payLabel =
    config.payment.methods.length === 0
      ? null
      : config.payment.methods
          .map((m) => (m === 'cash' ? 'espèces' : 'carte'))
          .join(' ou ');
  const payMoment = config.fulfillment === 'pickup' ? 'au retrait' : 'à la livraison';

  return (
    <div className="shop co">
      <h1 className="shop-title">Finaliser</h1>

      {err && <p className="co__err">{err}</p>}

      {config.requiresAddress && (
        <label className="co__field">
          <span className="co__label">Adresse de livraison</span>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="N°, rue, code, étage…"
            rows={2}
          />
        </label>
      )}

      {config.requiresPhone && (
        <label className="co__field">
          <span className="co__label">Téléphone</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="06 12 34 56 78"
          />
        </label>
      )}

      {config.deliverySlots.enabled && (
        <div className="co__field">
          <span className="co__label">Créneau</span>
          {slots.length === 0 ? (
            <p className="co__hint">Aucun créneau ouvert — ta commande sera préparée au plus tôt.</p>
          ) : (
            <div className="co__slots">
              {slots.map((s) => (
                <button
                  key={s.routeId}
                  className={`chip2 ${routeId === s.routeId ? 'on' : ''}`}
                  onClick={() => {
                    tap();
                    setRouteId(s.routeId);
                  }}
                >
                  {s.when === 'today' ? "aujourd'hui" : 'demain'} · {s.label}
                  {s.remaining != null && s.remaining <= 3 ? ` (${s.remaining})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {config.deliveryNote.enabled && (
        <label className="co__field">
          <span className="co__label">{config.deliveryNote.label}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Digicode, interphone, précisions…"
            rows={2}
          />
        </label>
      )}

      <div className="co__recap">
        <div className="co__recap-row">
          <span>{cart.count} article{cart.count > 1 ? 's' : ''}</span>
          <span>{cart.total} €</span>
        </div>
        {payLabel && <p className="co__hint">Paiement {payMoment} : {payLabel}.</p>}
      </div>
    </div>
  );
}
