/**
 * Fiche client consolidee (table `customers`, 1 ligne par user_id Telegram).
 *
 * - Cree / mise a jour a chaque commande (`upsertCustomer`) : username, tel, adresse.
 * - `name`, `delivery_note`, `notes`, `blocked` : edites par l'admin (Mini App).
 * - Le TAUX DE FIABILITE est CALCULE depuis `orders` (jamais stocke, pas de drift) :
 *   livrees vs no-show (annulation imputee au client). Les annulations legitimes
 *   (rupture de stock...) ne comptent pas contre le client.
 */
import { db } from './db';

export interface Customer {
  user_id: number;
  username: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  delivery_note: string | null;
  notes: string | null;
  blocked: boolean;
  first_seen: string;
  updated_at: string;
}

interface CustomerRow extends Omit<Customer, 'blocked'> {
  blocked: number;
}

export interface Reliability {
  total: number;
  delivered: number;
  noShow: number;
  cancelledOther: number;
  active: number;
  /** livrees / (livrees + no-show), ou null si le client n'a encore aucune des deux. */
  rate: number | null;
}

const q = {
  get: db.prepare<[number]>('SELECT * FROM customers WHERE user_id = ?'),
  upsert: db.prepare<{
    user_id: number;
    username: string | null;
    phone: string | null;
    address: string | null;
    delivery_note: string | null;
  }>(`
    INSERT INTO customers (user_id, username, phone, address, delivery_note)
    VALUES (@user_id, @username, @phone, @address, @delivery_note)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      phone    = excluded.phone,
      address  = excluded.address,
      delivery_note = COALESCE(excluded.delivery_note, customers.delivery_note),
      updated_at = datetime('now')
  `),
  update: db.prepare<{
    user_id: number;
    name: string | null;
    phone: string | null;
    address: string | null;
    delivery_note: string | null;
    notes: string | null;
    blocked: number;
  }>(`
    UPDATE customers SET
      name = @name, phone = @phone, address = @address,
      delivery_note = @delivery_note, notes = @notes, blocked = @blocked,
      updated_at = datetime('now')
    WHERE user_id = @user_id
  `),
  list: db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*)           FROM orders o WHERE o.user_id = c.user_id) AS total_orders,
      (SELECT SUM(o.status = 'delivered') FROM orders o WHERE o.user_id = c.user_id) AS delivered,
      (SELECT SUM(o.no_show = 1) FROM orders o WHERE o.user_id = c.user_id) AS no_show
    FROM customers c
    ORDER BY c.updated_at DESC
  `),
  reliability: db.prepare<[number]>(`
    SELECT
      COUNT(*)                                                    AS total,
      COALESCE(SUM(status = 'delivered'), 0)                      AS delivered,
      COALESCE(SUM(no_show = 1), 0)                               AS noShow,
      COALESCE(SUM(status = 'cancelled' AND no_show = 0), 0)      AS cancelledOther,
      COALESCE(SUM(status IN ('pending','confirmed','delivering')), 0) AS active
    FROM orders WHERE user_id = ?
  `),
};

function toCustomer(row: CustomerRow): Customer {
  return { ...row, blocked: row.blocked === 1 };
}

/** Appele au checkout : cree ou rafraichit la fiche a partir de la commande. */
export function upsertCustomer(input: {
  userId: number;
  username?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
  deliveryNote?: string | null;
}): void {
  q.upsert.run({
    user_id: input.userId,
    username: input.username ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    delivery_note: input.deliveryNote ?? null,
  });
}

export function getCustomer(userId: number): Customer | null {
  const row = q.get.get(userId) as CustomerRow | undefined;
  return row ? toCustomer(row) : null;
}

export function updateCustomer(
  userId: number,
  patch: Partial<Pick<Customer, 'name' | 'phone' | 'address' | 'delivery_note' | 'notes' | 'blocked'>>,
): Customer | null {
  const current = q.get.get(userId) as CustomerRow | undefined;
  if (!current) return null;
  q.update.run({
    user_id: userId,
    name: patch.name === undefined ? current.name : patch.name,
    phone: patch.phone === undefined ? current.phone : patch.phone,
    address: patch.address === undefined ? current.address : patch.address,
    delivery_note: patch.delivery_note === undefined ? current.delivery_note : patch.delivery_note,
    notes: patch.notes === undefined ? current.notes : patch.notes,
    blocked: patch.blocked === undefined ? current.blocked : patch.blocked ? 1 : 0,
  });
  return getCustomer(userId);
}

export function getReliability(userId: number): Reliability {
  const r = q.reliability.get(userId) as {
    total: number;
    delivered: number;
    noShow: number;
    cancelledOther: number;
    active: number;
  };
  const judged = r.delivered + r.noShow;
  return { ...r, rate: judged > 0 ? r.delivered / judged : null };
}

export interface CustomerSummary extends Customer {
  total_orders: number;
  delivered: number;
  no_show: number;
}

export function listCustomers(): CustomerSummary[] {
  return (q.list.all() as Array<CustomerRow & { total_orders: number; delivered: number | null; no_show: number | null }>).map(
    (row) => ({
      ...toCustomer(row),
      total_orders: row.total_orders,
      delivered: row.delivered ?? 0,
      no_show: row.no_show ?? 0,
    }),
  );
}
