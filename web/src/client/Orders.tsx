import { useEffect, useState } from 'react';
import { useBackButton, useNoMainButton } from './hooks';
import { shop } from './api';
import { tap } from '../telegram';
import type { ClientOrder } from './types';

interface Props {
  onReorder: (orderId: number) => void;
  onBack: () => void;
}

/** « en cours » vs terminé — pour la teinte de la pastille de statut. */
const DONE = new Set(['delivered', 'collected', 'cancelled', 'no_show']);

function formatDate(raw: string): string {
  const d = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function Orders({ onReorder, onBack }: Props) {
  useBackButton(onBack);
  useNoMainButton();
  const [orders, setOrders] = useState<ClientOrder[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    shop
      .orders()
      .then((r) => setOrders(r.orders))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="shop">
      <h1 className="shop-title">Mes commandes</h1>

      {err && <p className="co__err">{err}</p>}
      {!orders && !err && <p className="muted">Chargement…</p>}
      {orders?.length === 0 && <p className="empty">Aucune commande pour le moment.</p>}

      <ul className="ordlist">
        {orders?.map((o) => (
          <li key={o.id} className="ordcard">
            <div className="ordcard__top">
              <span className="ordcard__id">Commande #{o.id}</span>
              <span className={`ordcard__status ${DONE.has(o.status) ? 'is-done' : 'is-live'}`}>
                {o.statusLabel}
              </span>
            </div>
            <p className="ordcard__items">
              {o.items.map((l) => `${l.qty}× ${l.label}`).join('  ·  ')}
            </p>
            <div className="ordcard__foot">
              <span className="ordcard__date">{formatDate(o.created_at)}</span>
              <span className="ordcard__total">{o.total} €</span>
            </div>
            <button
              className="ordcard__again"
              onClick={() => {
                tap();
                onReorder(o.id);
              }}
            >
              Recommander
            </button>
          </li>
        ))}
      </ul>

      <button className="linkback" onClick={onBack}>
        ← La carte
      </button>
    </div>
  );
}
