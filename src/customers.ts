/**
 * Fiche client consolidee (table `customers`, 1 ligne par user_id Telegram).
 * Fait partie du COEUR : aucune notion de metier ici.
 *
 * - Cree / mise a jour a chaque commande (`upsertCustomer`) : username, tel, adresse.
 * - `name`, `delivery_note`, `notes`, `blocked` : edites par l'admin (Mini App).
 *
 * Le calcul du taux de fiabilite (livrees vs no-show) vit dans le module
 * `modules/reliability.ts`, active seulement si `features.reliability.enabled`.
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
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = c.user_id) AS total_orders
    FROM customers c
    ORDER BY c.updated_at DESC
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

export interface CustomerSummary extends Customer {
  total_orders: number;
}

export function listCustomers(): CustomerSummary[] {
  return (q.list.all() as Array<CustomerRow & { total_orders: number }>).map((row) => ({
    ...toCustomer(row),
    total_orders: row.total_orders,
  }));
}
