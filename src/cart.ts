/**
 * Panier — table `cart`, PARTAGE par le bot et la Mini App client.
 *
 * Le panier stocke des REFERENCES (`cat / prod / variant / qty`). Le libelle et
 * le prix sont RE-RESOLUS depuis le menu courant a chaque lecture : un article
 * retire du catalogue disparait du panier tout seul, un prix change est reflete
 * immediatement. `orders.items` reste, lui, une photo figee a la validation.
 *
 * Ce n'est PAS une commande : purge planifiee des paniers abandonnes (scheduler).
 */
import { db } from './db';
import { getMenu, reloadMenu } from './catalog';
import type { CartLine } from './types';

interface CartRow {
  cat_id: string;
  prod_id: string;
  variant_id: string;
  qty: number;
}

const q = {
  byUser: db.prepare<[number]>(
    'SELECT cat_id, prod_id, variant_id, qty FROM cart WHERE user_id = ? ORDER BY updated_at',
  ),
  upsert: db.prepare<[number, string, string, string, number]>(`
    INSERT INTO cart (user_id, cat_id, prod_id, variant_id, qty)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, cat_id, prod_id, variant_id)
    DO UPDATE SET qty = MIN(cart.qty + excluded.qty, 99), updated_at = datetime('now')
  `),
  setQty: db.prepare<[number, number, string, string, string]>(
    "UPDATE cart SET qty = MIN(?, 99), updated_at = datetime('now') WHERE user_id = ? AND cat_id = ? AND prod_id = ? AND variant_id = ?",
  ),
  removeLine: db.prepare<[number, string, string, string]>(
    'DELETE FROM cart WHERE user_id = ? AND cat_id = ? AND prod_id = ? AND variant_id = ?',
  ),
  clear: db.prepare<[number]>('DELETE FROM cart WHERE user_id = ?'),
  purge: db.prepare<[string]>(`
    DELETE FROM cart WHERE user_id IN (
      SELECT user_id FROM cart GROUP BY user_id
      HAVING MAX(updated_at) < datetime('now', ?)
    )
  `),
};

export function lineKey(catId: string, prodId: string, variantId?: string): string {
  return `${catId}:${prodId}:${variantId ?? ''}`;
}

/** Decompose une cle "cat:prod:variant" (les ids n'ont jamais de ':'). */
function parseKey(key: string): [string, string, string] {
  const [catId = '', prodId = '', variantId = ''] = key.split(':');
  return [catId, prodId, variantId];
}

/** Re-resout une ligne stockee contre le menu courant. `null` si plus vendable. */
function resolve(row: CartRow, menu = getMenu()): CartLine | null {
  const item = menu[row.cat_id]?.items[row.prod_id];
  if (!item) return null;
  if (row.variant_id) {
    const v = item.variants.find((x) => x.id === row.variant_id);
    if (!v) return null;
    return {
      catId: row.cat_id,
      prodId: row.prod_id,
      variantId: row.variant_id,
      label: `${item.label} - ${v.label}`,
      price: v.price,
      qty: row.qty,
    };
  }
  // Produit qui a gagne des tailles depuis l'ajout : la ligne n'a plus de sens.
  if (item.variants.length > 0) return null;
  return { catId: row.cat_id, prodId: row.prod_id, label: item.label, price: item.price, qty: row.qty };
}

/** Toutes les lignes vendables du panier d'un utilisateur (tableau vide si aucun). */
export function getCart(userId: number): CartLine[] {
  const menu = getMenu();
  return (q.byUser.all(userId) as CartRow[])
    .map((r) => resolve(r, menu))
    .filter((l): l is CartLine => l !== null);
}

/** Ajoute une quantite ; si la reference est deja au panier, on cumule (max 99). */
export function addToCart(
  userId: number,
  ref: Pick<CartLine, 'catId' | 'prodId' | 'variantId'>,
  qty: number,
): void {
  q.upsert.run(userId, ref.catId, ref.prodId, ref.variantId ?? '', qty);
}

/** Change la quantite d'une ligne (0 ou moins -> retiree). */
export function setLineQty(userId: number, key: string, qty: number): void {
  const [catId, prodId, variantId] = parseKey(key);
  if (qty <= 0) q.removeLine.run(userId, catId, prodId, variantId);
  else q.setQty.run(qty, userId, catId, prodId, variantId);
}

/** Retire une ligne du panier. */
export function removeLine(userId: number, key: string): void {
  const [catId, prodId, variantId] = parseKey(key);
  q.removeLine.run(userId, catId, prodId, variantId);
}

/** Vide entierement le panier d'un utilisateur. */
export function clearCart(userId: number): void {
  q.clear.run(userId);
}

/** Montant total du panier (en euros). */
export function cartTotal(userId: number): number {
  return getCart(userId).reduce((sum, line) => sum + line.price * line.qty, 0);
}

/** Nombre total d'articles (somme des quantites). */
export function cartCount(userId: number): number {
  return getCart(userId).reduce((sum, line) => sum + line.qty, 0);
}

/** Supprime les paniers inactifs depuis plus de `hours` heures. Renvoie le nb de lignes purgees. */
export function purgeCarts(hours = 48): number {
  return q.purge.run(`-${hours} hours`).changes;
}

/**
 * Nettoie le panier avant validation d'une commande : relit le menu frais,
 * retire les lignes dont le produit / la taille n'est plus disponible.
 * Renvoie les libelles retires, pour prevenir le client.
 *
 * (Le prix n'a pas a etre "reconcilie" : le panier resout toujours le prix
 * courant. Le recap affiche donc deja les bons prix.)
 */
export function reconcileCart(userId: number): { removed: string[] } {
  const menu = reloadMenu(); // relecture forcee : ne jamais valider sur un cache perime
  const removed: string[] = [];
  for (const row of q.byUser.all(userId) as CartRow[]) {
    if (resolve(row, menu) === null) {
      const item = menu[row.cat_id]?.items[row.prod_id];
      removed.push(item?.label ?? `article #${row.prod_id}`);
      q.removeLine.run(userId, row.cat_id, row.prod_id, row.variant_id);
    }
  }
  return { removed };
}
