import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { Dashboard } from './Dashboard';
import { OrderDetail } from './OrderDetail';
import { reliabilityBadge, slotText, STATUS_LABEL, type Order, type OrderStatus } from './types';

type Filter = 'open' | OrderStatus;

const OPEN_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'delivering'];
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'A traiter' },
  { key: 'pending', label: STATUS_LABEL.pending },
  { key: 'confirmed', label: STATUS_LABEL.confirmed },
  { key: 'delivering', label: STATUS_LABEL.delivering },
  { key: 'delivered', label: STATUS_LABEL.delivered },
  { key: 'cancelled', label: STATUS_LABEL.cancelled },
];

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Partial<Record<string, number>>>({});
  const [filter, setFilter] = useState<Filter>('open');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashKey, setDashKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listOrders();
      setOrders(data.orders);
      setCounts(data.counts);
      setDashKey((k) => k + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === 'open') return orders.filter((o) => OPEN_STATUSES.includes(o.status));
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const selected = selectedId === null ? null : (orders.find((o) => o.id === selectedId) ?? null);

  const applyOrder = useCallback((updated: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setDashKey((k) => k + 1);
    void api
      .listOrders()
      .then((d) => setCounts(d.counts))
      .catch(() => undefined);
  }, []);

  if (selected) {
    return <OrderDetail order={selected} onBack={() => setSelectedId(null)} onChanged={applyOrder} />;
  }

  return (
    <>
      <h1>Commandes</h1>

      {error && <div className="error">{error}</div>}

      <Dashboard refreshKey={dashKey} onShowPending={() => setFilter('pending')} />

      <div className="counts">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {f.key !== 'open' && counts[f.key] ? ` (${counts[f.key]})` : ''}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Chargement...</p>}
      {!loading && !error && visible.length === 0 && <p className="muted">Aucune commande.</p>}

      {visible.map((o) => (
        <div key={o.id} className="card clickable" onClick={() => setSelectedId(o.id)}>
          <div className="row">
            <strong>#{o.id}</strong>
            <span className={`badge ${o.status}`}>{STATUS_LABEL[o.status]}</span>
          </div>
          <div className="muted">
            {o.customer.name || (o.username ? `@${o.username}` : `id ${o.user_id}`)} - {o.total} EUR -{' '}
            {o.items.length} article(s)
            {reliabilityBadge(o.customer.reliability, o.customer.blocked) && (
              <span className="badge cancelled" style={{ marginLeft: 6 }}>
                {reliabilityBadge(o.customer.reliability, o.customer.blocked)}
              </span>
            )}
          </div>
          <div className="muted">🕒 {slotText(o.route)} - {o.address}</div>
        </div>
      ))}

      {!loading && (
        <button className="btn secondary" onClick={() => void load()} style={{ marginTop: 8 }}>
          Rafraichir
        </button>
      )}
    </>
  );
}

function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw === 'not_admin') return "Ton compte n'est pas autorise (ADMIN_IDS).";
  if (raw === 'invalid_init_data') return 'Session Telegram invalide. Rouvre la Mini App depuis le bot.';
  return raw;
}
