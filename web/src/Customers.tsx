import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { CustomerDetail } from './CustomerDetail';
import { reliabilityBadge, type CustomerSummary } from './types';

export function Customers() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCustomers((await api.customers.list()).customers);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.name, c.username, c.phone, String(c.user_id)]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [customers, search]);

  if (selected !== null) {
    return (
      <CustomerDetail
        userId={selected}
        onBack={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  }

  return (
    <>
      <h1>Clients</h1>
      {error && <div className="error">{error}</div>}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher (nom, @pseudo, tél)"
        style={{ marginBottom: 10 }}
      />

      {loading && <p className="muted">Chargement…</p>}
      {!loading && visible.length === 0 && (
        <p className="empty">{search ? 'Aucun client ne correspond.' : 'Aucun client pour l’instant.'}</p>
      )}

      {visible.map((c) => {
        const badge = reliabilityBadge(c.reliability, c.blocked);
        return (
          <div key={c.user_id} className="card clickable" onClick={() => setSelected(c.user_id)}>
            <div className="row">
              <strong>{c.name || (c.username ? `@${c.username}` : `#${c.user_id}`)}</strong>
              {badge && <span className={`flag${c.blocked ? ' blocked' : ''}`}>{badge}</span>}
            </div>
            <div className="muted small">
              {c.phone ?? '—'} · {c.total_orders} commande{c.total_orders > 1 ? 's' : ''}
            </div>
          </div>
        );
      })}
    </>
  );
}
