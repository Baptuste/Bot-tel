/**
 * Acces a la table `orders`.
 *
 * Une commande est une donnee DEFINITIVE (a ne pas confondre avec une session,
 * qui est de l'etat temporaire). Le panier en memoire devient une ligne ici
 * au moment de la validation, puis le panier est vide.
 */
import { db } from './db';
import {
  editableStatusIds,
  initialStatusId,
  openStatusIds,
  stageById,
} from './orderStages';
import type { CartLine } from './types';

/**
 * Le statut d'une commande est un id d'étape de `features.orderFlow` — donc une
 * simple chaîne. Sa signification passe par le rôle de l'étape (`orderStages.ts`),
 * jamais par une comparaison littérale.
 */
export type OrderStatus = string;

export interface OrderRow {
  id: number;
  user_id: number;
  username: string | null;
  phone: string | null;   // null = mode retrait boutique (cf. features.requiresPhone)
  items: string; // JSON brut
  address: string | null; // null = mode retrait boutique (cf. features.requiresAddress)
  total: number;
  status: OrderStatus;
  route_id: number | null;
  route_position: number | null;
  referral_discount: number | null; // remise parrainage appliquée (module referral)
  cancellation_reason: string | null;
  no_show: number;
  delivery_note: string | null;
  created_at: string;
  updated_at: string | null;
  delivered_at: string | null;
}

export interface Order extends Omit<OrderRow, 'items' | 'no_show'> {
  items: CartLine[];
  no_show: boolean;
}

export interface NewOrder {
  userId: number;
  username?: string | undefined;
  phone?: string | undefined;   // omis en mode retrait boutique
  address?: string | undefined; // omis en mode retrait boutique
  items: CartLine[];
  total: number;
  routeId?: number | null;
  deliveryNote?: string | null;
  referralDiscount?: number | null;
}

const insertOrder = db.prepare<{
  user_id: number;
  username: string | null;
  phone: string | null;
  items: string;
  address: string | null;
  total: number;
  route_id: number | null;
  delivery_note: string | null;
  status: string;
  referral_discount: number | null;
}>(`
  INSERT INTO orders
    (user_id, username, phone, items, address, total, route_id, delivery_note, status, referral_discount, updated_at)
  VALUES
    (@user_id, @username, @phone, @items, @address, @total, @route_id, @delivery_note, @status, @referral_discount, datetime('now'))
`);

const selectOrder = db.prepare<[number]>('SELECT * FROM orders WHERE id = ?');

const selectOrdersByUser = db.prepare<[number]>(
  'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
);

const selectLastOrder = db.prepare<[number]>(
  'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
);

const updateStatus = db.prepare<[string, number]>(
  "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?",
);

const stampDelivered = db.prepare<[number]>(
  "UPDATE orders SET delivered_at = datetime('now') WHERE id = ?",
);

const updateCancellation = db.prepare<[string | null, number, number]>(
  'UPDATE orders SET cancellation_reason = ?, no_show = ? WHERE id = ?',
);

// Listes de statuts issues de `features.orderFlow` (statiques : figées au chargement).
const OPEN_IDS = openStatusIds();
const EDITABLE_IDS = editableStatusIds();
const placeholders = (ids: readonly string[]) => ids.map(() => '?').join(', ');

const selectOpenOrders = db.prepare(
  `SELECT * FROM orders WHERE status IN (${placeholders(OPEN_IDS)}) ORDER BY created_at ASC`,
);

const countByStatus = db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');

const selectRecentOrders = db.prepare<[number]>(
  'SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT ?',
);

const selectOrdersByStatus = db.prepare<[string]>(
  'SELECT * FROM orders WHERE status = ? ORDER BY created_at ASC',
);

const assignRoute = db.prepare<[number | null, number | null, number]>(
  'UPDATE orders SET route_id = ?, route_position = ? WHERE id = ?',
);

const maxRoutePosition = db.prepare<[number]>(
  'SELECT COALESCE(MAX(route_position), -1) AS m FROM orders WHERE route_id = ?',
);

const selectOrdersByRoute = db.prepare<[number]>(
  'SELECT * FROM orders WHERE route_id = ? ORDER BY route_position, created_at, id',
);

const setRoutePosition = db.prepare<[number, number]>(
  'UPDATE orders SET route_position = ? WHERE id = ?',
);

const selectAssignableOrders = db.prepare(
  `SELECT * FROM orders WHERE route_id IS NULL AND status IN (${placeholders(EDITABLE_IDS)}) ORDER BY created_at ASC`,
);

const clearRouteFromOrders = db.prepare<[number]>(
  'UPDATE orders SET route_id = NULL WHERE route_id = ?',
);

function hydrate(row: OrderRow): Order {
  return { ...row, items: JSON.parse(row.items) as CartLine[], no_show: row.no_show === 1 };
}

/** Enregistre une nouvelle commande (statut initial du pipeline) et renvoie son id. */
export function createOrder(o: NewOrder): number {
  const info = insertOrder.run({
    user_id: o.userId,
    username: o.username ?? null,
    phone: o.phone ?? null,
    items: JSON.stringify(o.items),
    address: o.address ?? null,
    total: o.total,
    route_id: o.routeId ?? null,
    delivery_note: o.deliveryNote ?? null,
    status: initialStatusId(),
    referral_discount: o.referralDiscount ?? null,
  });
  return Number(info.lastInsertRowid);
}

export function getOrder(id: number): Order | null {
  const row = selectOrder.get(id) as OrderRow | undefined;
  return row ? hydrate(row) : null;
}

export function getOrdersByUser(userId: number): Order[] {
  return (selectOrdersByUser.all(userId) as OrderRow[]).map(hydrate);
}

/** Derniere commande d'un client (pre-remplissage du checkout). */
export function getLastOrder(userId: number): Order | null {
  const row = selectLastOrder.get(userId) as OrderRow | undefined;
  return row ? hydrate(row) : null;
}

export interface CancellationMeta {
  reason?: string | undefined;
  /** true = imputee au client (compte contre sa fiabilite). */
  noShow?: boolean | undefined;
}

/** Change le statut d'une commande et renvoie la version a jour. */
export function updateOrderStatus(
  id: number,
  status: OrderStatus,
  meta?: CancellationMeta,
): Order | null {
  updateStatus.run(status, id);
  const role = stageById(status)?.role;
  if (role === 'fulfilled') stampDelivered.run(id);
  if (role === 'cancelled') {
    updateCancellation.run(meta?.reason?.trim() || null, meta?.noShow ? 1 : 0, id);
  }
  return getOrder(id);
}

/** Statuts sur lesquels l'admin peut encore modifier le contenu d'une commande. */
export const EDITABLE_STATUSES: OrderStatus[] = EDITABLE_IDS;

const updateDetails = db.prepare<{
  id: number;
  address: string | null;
  delivery_note: string | null;
  items: string;
  total: number;
}>(`
  UPDATE orders
  SET address = @address, delivery_note = @delivery_note, items = @items,
      total = @total, updated_at = datetime('now')
  WHERE id = @id
`);

/** Modifie adresse / precision / articles d'une commande. Le total est recalcule. */
export function updateOrderDetails(
  id: number,
  patch: { address?: string; deliveryNote?: string | null; items?: CartLine[] },
): Order | null {
  const current = getOrder(id);
  if (!current) return null;
  const items = patch.items ?? current.items;
  updateDetails.run({
    id,
    address: patch.address ?? current.address,
    delivery_note:
      patch.deliveryNote === undefined ? current.delivery_note : patch.deliveryNote,
    items: JSON.stringify(items),
    total: items.reduce((sum, l) => sum + l.price * l.qty, 0),
  });
  return getOrder(id);
}

/** Commandes non terminées (statuts « en cours »), plus ancienne d'abord. */
export function getOpenOrders(): Order[] {
  return (selectOpenOrders.all(...OPEN_IDS) as OrderRow[]).map(hydrate);
}

/** Nombre de commandes par statut : { pending: 2, delivered: 5, ... }. */
export function getStatusCounts(): Partial<Record<OrderStatus, number>> {
  const rows = countByStatus.all() as Array<{ status: OrderStatus; n: number }>;
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/** Commandes recentes (toutes, plus recente d'abord) - pour la Mini App admin. */
export function getRecentOrders(limit = 100): Order[] {
  return (selectRecentOrders.all(limit) as OrderRow[]).map(hydrate);
}

export function getOrdersByStatus(status: OrderStatus): Order[] {
  return (selectOrdersByStatus.all(status) as OrderRow[]).map(hydrate);
}

/** Affecte (a la fin de la file) ou retire (null) une commande d'une tournee. */
export function setOrderRoute(orderId: number, routeId: number | null): Order | null {
  const position =
    routeId === null ? null : ((maxRoutePosition.get(routeId) as { m: number }).m + 1);
  assignRoute.run(routeId, position, orderId);
  return getOrder(orderId);
}

/** Commandes affectees a une tournee, dans l'ordre de livraison. */
export function getOrdersByRoute(routeId: number): Order[] {
  return (selectOrdersByRoute.all(routeId) as OrderRow[]).map(hydrate);
}

/** Deplace une commande d'un cran dans l'ordre de livraison de sa tournee. */
export function moveOrderInRoute(orderId: number, dir: 'up' | 'down'): void {
  const order = getOrder(orderId);
  if (!order || order.route_id === null) return;
  const siblings = getOrdersByRoute(order.route_id);
  const i = siblings.findIndex((o) => o.id === orderId);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= siblings.length) return;

  const a = siblings[i]!;
  const b = siblings[j]!;
  const swap = db.transaction(() => {
    setRoutePosition.run(b.route_position ?? j, a.id);
    setRoutePosition.run(a.route_position ?? i, b.id);
  });
  swap();
}

/** Commandes affectables a une tournee : sans tournee, encore actives. */
export function getAssignableOrders(): Order[] {
  return (selectAssignableOrders.all(...EDITABLE_IDS) as OrderRow[]).map(hydrate);
}

/** Detache toutes les commandes d'une tournee (avant suppression). */
export function detachRouteOrders(routeId: number): void {
  clearRouteFromOrders.run(routeId);
}
