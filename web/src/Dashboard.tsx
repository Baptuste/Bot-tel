import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Dashboard as DashboardData } from './types';

interface Props {
  /** Appelé quand on tape l'alerte "commandes en attente". */
  onShowPending: () => void;
  /** Incrémenté par le parent pour forcer un rafraîchissement. */
  refreshKey: number;
}

export function Dashboard({ onShowPending, refreshKey }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return null;

  const overdue = data.pending.filter((p) => p.overdue);

  return (
    <div className="dash">
      <div className="dash-head">Aujourd'hui</div>
      <div className="dash-today">
        <div>
          <strong>{data.today.orders}</strong>
          <span className="muted small">commandes</span>
        </div>
        <div>
          <strong>{data.today.delivered}</strong>
          <span className="muted small">livrées</span>
        </div>
        <div>
          <strong>{data.today.revenue} €</strong>
          <span className="muted small">encaissé</span>
        </div>
        {data.today.cancelled > 0 && (
          <div>
            <strong>{data.today.cancelled}</strong>
            <span className="muted small">annulées</span>
          </div>
        )}
      </div>

      {data.pending.length > 0 && (
        <button
          className={`dash-alert ${overdue.length > 0 ? 'urgent' : ''}`}
          onClick={onShowPending}
        >
          {overdue.length > 0
            ? `⏰ ${overdue.length} commande(s) en attente depuis +${Math.max(...overdue.map((p) => p.minutes))} min`
            : `${data.pending.length} commande(s) en attente`}
        </button>
      )}

      {data.activeRoutes.map((r) => {
        const pct = r.total > 0 ? Math.round((r.delivered / r.total) * 100) : 0;
        const today = new Date().toISOString().slice(0, 10);
        return (
          <div key={r.id} className="dash-route">
            <div>
              🛵 {r.label} ({r.date === today ? 'auj.' : r.date})
              {r.driver ? ` — ${r.driver}` : ''} · <strong>{r.delivered}/{r.total}</strong> livrées
            </div>
            <div className="progress" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
