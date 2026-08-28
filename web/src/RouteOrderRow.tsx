import { api } from './api';
import { confirmDialog, promptDialog } from './telegram';
import { STATUS_LABEL, type Order, type RouteStatus } from './types';

interface Props {
  routeId: number;
  routeStatus: RouteStatus;
  order: Order;
  index: number;
  count: number;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}

export function RouteOrderRow({ routeId, routeStatus, order: o, index, count, busy, run }: Props) {
  const active = o.status === 'confirmed' || o.status === 'delivering' || o.status === 'pending';
  const canReorder = routeStatus !== 'done' && active;

  async function markDelivered() {
    if (await confirmDialog(`Commande #${o.id} livrée ?\nLe client (et les suivants) seront notifiés.`)) {
      await run(() => api.setStatus(o.id, 'delivered'));
    }
  }

  async function reportProblem() {
    const reason = promptDialog(`Souci sur la commande #${o.id} — raison ?`);
    if (reason === null) return; // annulé
    const noShow = await confirmDialog('Imputer au client (compte comme no-show) ?');
    await run(() => api.setStatus(o.id, 'cancelled', { reason: reason.trim() || undefined, no_show: noShow }));
  }

  return (
    <div className="product">
      <div>
        <div>
          <span className="muted">{index + 1}.</span> #{o.id}{' '}
          <span className="muted">- {o.username ? `@${o.username}` : o.user_id}</span>
        </div>
        <div className="muted small">
          {o.total} EUR - {STATUS_LABEL[o.status]} - {o.address ?? 'retrait boutique'}
        </div>
      </div>

      <div className="product-actions">
        {canReorder && (
          <>
            <button
              className="mini"
              disabled={busy || index === 0}
              onClick={() => void run(() => api.routes.move(routeId, o.id, 'up'))}
            >
              ▲
            </button>
            <button
              className="mini"
              disabled={busy || index >= count - 1}
              onClick={() => void run(() => api.routes.move(routeId, o.id, 'down'))}
            >
              ▼
            </button>
          </>
        )}

        {routeStatus === 'planned' && (
          <button
            className="mini danger"
            disabled={busy}
            onClick={() => void run(() => api.routes.unassign(routeId, o.id))}
          >
            Retirer
          </button>
        )}

        {routeStatus === 'started' && o.status === 'delivering' && (
          <>
            <button className="mini" disabled={busy} onClick={() => void markDelivered()}>
              📦 Livrée
            </button>
            <button className="mini danger" disabled={busy} onClick={() => void reportProblem()}>
              ❌ Souci
            </button>
          </>
        )}
      </div>
    </div>
  );
}
