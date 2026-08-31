/**
 * Creation d'une commande a partir du panier — logique PURE, sans UI.
 *
 * Appelee par la scene checkout du bot ET par l'endpoint `/api/shop/orders` de
 * la Mini App client. Ne fait AUCUN envoi de message : le caller compose sa
 * confirmation et declenche les notifications.
 */
import { cartTotal, clearCart, getCart, reconcileCart } from './cart';
import { upsertCustomer } from './customers';
import { features } from './features';
import { commitCheckout as commitReferral, previewCheckout as previewReferral } from './modules/referral';
import { createOrder, getOrder, type Order } from './orders';

export interface CreateClientOrderInput {
  userId: number;
  username?: string | undefined;
  address?: string | undefined;
  phone?: string | undefined;
  routeId?: number | null;
  deliveryNote?: string | null;
}

export type CreateClientOrderResult = {
  /** Libelles des articles retires (produit / taille devenu indisponible depuis l'ajout). */
  removed: string[];
} & (
  | {
      ok: true;
      orderId: number;
      order: Order;
      total: number;
      referralDiscount: number;
      /** Parrain a feliciter (son filleul vient de commander), s'il y en a un. */
      parrainToNotify: { userId: number; reward: number } | null;
    }
  | {
      ok: false;
      /** empty : panier vide · missing_info : adresse/tel manquant ·
       *  items_changed : des articles ont ete retires -> refaire valider le recap. */
      reason: 'empty' | 'missing_info' | 'items_changed';
    }
);

/**
 * Valide le panier et cree la commande. Ne cree RIEN si le panier est vide,
 * si une info requise manque, ou si des articles ont ete retires depuis le
 * recap (le caller doit alors refaire valider).
 */
export function createClientOrder(input: CreateClientOrderInput): CreateClientOrderResult {
  const { userId } = input;

  // Un produit / une taille a pu devenir indisponible depuis l'ajout au panier.
  const { removed } = reconcileCart(userId);
  const lines = getCart(userId);

  if (lines.length === 0) return { ok: false, reason: 'empty', removed };

  const missingInfo =
    (features.requiresAddress && !input.address) || (features.requiresPhone && !input.phone);
  if (missingInfo) return { ok: false, reason: 'missing_info', removed };

  // Des articles ont saute : on ne valide pas a l'aveugle, le caller refait voir.
  if (removed.length > 0) return { ok: false, reason: 'items_changed', removed };

  const subtotal = cartTotal(userId);
  const ref = features.referral.enabled ? previewReferral(userId, subtotal) : null;
  const referralDiscount = ref && ref.discount > 0 ? ref.discount : 0;
  const total = subtotal - referralDiscount;

  const orderId = createOrder({
    userId,
    username: input.username,
    phone: input.phone,
    address: input.address,
    items: lines,
    total,
    routeId: input.routeId ?? null,
    deliveryNote: input.deliveryNote ?? null,
    referralDiscount: referralDiscount || null,
  });

  upsertCustomer({
    userId,
    username: input.username,
    phone: input.phone,
    address: input.address,
    deliveryNote: input.deliveryNote ?? undefined,
  });
  clearCart(userId);

  let parrainToNotify: { userId: number; reward: number } | null = null;
  if (ref && referralDiscount > 0) {
    const { parrainToNotify: parrainId } = commitReferral(ref);
    if (parrainId !== null) {
      parrainToNotify = { userId: parrainId, reward: features.referral.parrainReward };
    }
  }

  return {
    ok: true,
    orderId,
    order: getOrder(orderId)!,
    total,
    referralDiscount,
    parrainToNotify,
    removed: [],
  };
}
