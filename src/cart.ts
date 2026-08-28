/**
 * Panier en MEMOIRE.
 *
 * Structure : Map<userId, Map<"catId:prodId:variantId", CartLine>>.
 * -> perdu au redemarrage du bot (acceptable : un panier n'est pas une commande).
 */
import { reloadMenu } from './catalog';
import type { CartLine } from './types';

const carts = new Map<number, Map<string, CartLine>>();

export function lineKey(catId: string, prodId: string, variantId?: string): string {
  return `${catId}:${prodId}:${variantId ?? ''}`;
}

/** Toutes les lignes du panier d'un utilisateur (tableau vide si aucun). */
export function getCart(userId: number): CartLine[] {
  const cart = carts.get(userId);
  return cart ? [...cart.values()] : [];
}

/** Ajoute une quantite ; si le produit est deja au panier, on cumule. */
export function addToCart(userId: number, item: Omit<CartLine, 'qty'>, qty: number): void {
  let cart = carts.get(userId);
  if (!cart) {
    cart = new Map();
    carts.set(userId, cart);
  }
  const key = lineKey(item.catId, item.prodId, item.variantId);
  const existing = cart.get(key);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.set(key, { ...item, qty });
  }
}

/** Change la quantite d'une ligne (0 ou moins -> retiree). */
export function setLineQty(userId: number, key: string, qty: number): void {
  const cart = carts.get(userId);
  const line = cart?.get(key);
  if (!cart || !line) return;
  if (qty <= 0) cart.delete(key);
  else line.qty = Math.min(qty, 99);
}

/** Retire une ligne du panier. */
export function removeLine(userId: number, key: string): void {
  carts.get(userId)?.delete(key);
}

/** Vide entierement le panier d'un utilisateur. */
export function clearCart(userId: number): void {
  carts.delete(userId);
}

/** Montant total du panier (en euros). */
export function cartTotal(userId: number): number {
  return getCart(userId).reduce((sum, line) => sum + line.price * line.qty, 0);
}

/** Nombre total d'articles (somme des quantites). */
export function cartCount(userId: number): number {
  return getCart(userId).reduce((sum, line) => sum + line.qty, 0);
}

/**
 * Confronte le panier au menu courant. Retire les lignes dont le produit / la
 * taille n'est plus disponible et met a jour les prix qui ont change.
 * Renvoie ce qui a ete retire / re-tarife, pour prevenir le client.
 */
export function reconcileCart(userId: number): { removed: CartLine[]; repriced: CartLine[] } {
  const cart = carts.get(userId);
  const removed: CartLine[] = [];
  const repriced: CartLine[] = [];
  if (!cart) return { removed, repriced };

  // Relecture forcee : la validation d'une commande ne doit jamais s'appuyer
  // sur un cache potentiellement perime.
  const menu = reloadMenu();
  for (const [key, line] of [...cart.entries()]) {
    const item = menu[line.catId]?.items[line.prodId];
    if (!item) {
      cart.delete(key);
      removed.push(line);
      continue;
    }
    if (line.variantId) {
      const variant = item.variants.find((v) => v.id === line.variantId);
      if (!variant) {
        cart.delete(key);
        removed.push(line);
        continue;
      }
      if (variant.price !== line.price) {
        line.price = variant.price;
        repriced.push({ ...line });
      }
    } else if (item.variants.length > 0) {
      // Le produit a gagne des tailles depuis l'ajout : la ligne n'a plus de sens.
      cart.delete(key);
      removed.push(line);
    } else if (item.price !== line.price) {
      line.price = item.price;
      repriced.push({ ...line });
    }
  }
  return { removed, repriced };
}
