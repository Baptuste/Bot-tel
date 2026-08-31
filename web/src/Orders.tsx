import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { Dashboard } from './Dashboard';
import { useFlow } from './features';
import { OrderDetail } from './OrderDetail';
import { reliabilityBadge, slotText, type Order } from './types';

type Filter = 'open' | string;

export function Orders() {
  const flow = useFlow();
  const openStatuses = useMemo(() => flow.openIds(), [flow]);
  const filters: { key: Filter; label: string }[] = useMemo(
    () => [
      { key: 'open', label: 'A traiter' },
      ...flow.stages.map((s) => ({ key: s.id, label: flow.label(s.id) })),
    ],
    [flow],
  );

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
    if (filter === 'open') return orders.filter((o) => openStatuses.includes(o.status));
    return orders.filter((o) => o.status === filter);
  }, [orders, filter, openStatuses]);

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

      <Dashboard
        refreshKey={dashKey}
        onShowPending={() => setFilter(flow.roleId('placed') ?? 'open')}
      />

      <div className="counts">
        {filters.map((f) => (
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

      {visible.map((o) => {
        const flag = reliabilityBadge(o.customer.reliability, o.customer.blocked);
        return (
          <div key={o.id} className="card clickable" onClick={() => setSelectedId(o.id)}>
            <div className="row">
              <strong>#{o.id}</strong>
              <span className="badge" data-role={flow.role(o.status)}>
                {flow.label(o.status)}
              </span>
            </div>
            <div className="tk-who">
              <span>
                {o.customer.name || (o.username ? `@${o.username}` : `client ${o.user_id}`)}
              </span>
              {flag && <span className={`flag${o.customer.blocked ? ' blocked' : ''}`}>{flag}</span>}
            </div>
            <div className="tk-line">
              <span>
                {o.items.length} article{o.items.length > 1 ? 's' : ''}
              </span>
              <span className="tk-total">{o.total} EUR</span>
            </div>
            <div className="tk-sub muted small">
              🕒 {slotText(o.route)} · {o.address ?? 'retrait boutique'}
            </div>
          </div>
        );
      })}

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
