/**
 * Tableau de bord admin : agregats calcules a la demande + detection des
 * commandes en attente depuis trop longtemps.
 *
 * "Aujourd'hui" = date LOCALE du serveur (celle de la boutique).
 */
import type Database from 'better-sqlite3';
import { db } from './db';
import { features } from './features';
import { type OrderStatus } from './orders';

/** Au-dela, une commande encore "en attente" est signalee a l'admin. */
export const PENDING_ALERT_MINUTES = 20;

export interface DashboardData {
  counts: Partial<Record<OrderStatus, number>>;
  today: { orders: number; delivered: number; cancelled: number; revenue: number };
  pending: Array<{ id: number; who: string; total: number; minutes: number; overdue: boolean }>;
  activeRoutes: Array<{ id: number; label: string; date: string; delivered: number; total: number }>;
}

const q = {
  counts: db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status'),
  today: db.prepare(`
    SELECT
      COUNT(*)                                                        AS orders,
      COALESCE(SUM(status = 'delivered'), 0)                          AS delivered,
      COALESCE(SUM(status = 'cancelled'), 0)                          AS cancelled,
      COALESCE(SUM(CASE WHEN status = 'delivered' THEN total END), 0) AS revenue
    FROM orders
    WHERE date(created_at, 'localtime') = date('now', 'localtime')
  `),
  pending: db.prepare(`
    SELECT id, username, user_id, total,
      CAST((julianday('now') - julianday(created_at)) * 24 * 60 AS INTEGER) AS minutes
    FROM orders WHERE status = 'pending'
    ORDER BY created_at ASC
  `),
  overdue: db.prepare<[number]>(`
    SELECT id FROM orders
    WHERE status = 'pending' AND alerted = 0
      AND created_at < datetime('now', '-' || ? || ' minutes')
    ORDER BY created_at ASC
  `),
  markAlerted: db.prepare('UPDATE orders SET alerted = 1 WHERE id = ?'),
};

// Prepare a la demande : depend de la table `routes` (module tournees), qui
// n'existe pas pour un client sans livraison.
let _activeRoutes: Database.Statement | undefined;
function activeRoutesStmt(): Database.Statement {
  if (!_activeRoutes) {
    _activeRoutes = db.prepare(`
      SELECT r.id, r.time_slot AS label, r.date,
        COUNT(o.id)                                    AS total,
        COALESCE(SUM(o.status = 'delivered'), 0)       AS delivered
      FROM routes r
      LEFT JOIN orders o ON o.route_id = r.id
      WHERE r.status = 'started'
      GROUP BY r.id
      ORDER BY r.date, r.slot_time
    `);
  }
  return _activeRoutes;
}

export function getDashboard(): DashboardData {
  const counts = Object.fromEntries(
    (q.counts.all() as Array<{ status: OrderStatus; n: number }>).map((r) => [r.status, r.n]),
  );
  const today = q.today.get() as DashboardData['today'];

  const pending = (
    q.pending.all() as Array<{
      id: number;
      username: string | null;
      user_id: number;
      total: number;
      minutes: number;
    }>
  ).map((r) => ({
    id: r.id,
    who: r.username ? `@${r.username}` : `#${r.user_id}`,
    total: r.total,
    minutes: r.minutes,
    overdue: r.minutes >= PENDING_ALERT_MINUTES,
  }));

  const activeRoutes = features.deliverySlots.enabled
    ? (activeRoutesStmt().all() as DashboardData['activeRoutes'])
    : [];

  return { counts, today, pending, activeRoutes };
}

/** Ids des commandes en attente depuis +X min pas encore signalees a l'admin. */
export function getOverduePendingIds(minutes = PENDING_ALERT_MINUTES): number[] {
  return (q.overdue.all(minutes) as Array<{ id: number }>).map((r) => r.id);
}

export function markAlerted(ids: number[]): void {
  const run = db.transaction((list: number[]) => {
    for (const id of list) q.markAlerted.run(id);
  });
  run(ids);
}
