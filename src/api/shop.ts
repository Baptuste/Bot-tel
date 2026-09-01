/**
 * API de la Mini App CLIENT (`/api/shop/*`).
 *
 * Auth = `requireUser` (initData valide, pas forcement admin). Le panier et les
 * commandes vivent dans la meme base que le bot : ces routes sont juste une
 * autre fenetre dessus.
 */
import { Router } from 'express';
import type { Telegram } from 'telegraf';
import { addToCart, cartCount, cartTotal, clearCart, getCart, setLineQty } from '../cart';
import { getMenu } from '../catalog';
import { getCustomer } from '../customers';
import { features } from '../features';
import { notifyNewOrder, safeSend } from '../orderFlow';
import { createClientOrder, orderConfirmationText } from '../order';
import { getLastOrder, getOrder, getOrdersByUser } from '../orders';
import { statusLabel } from '../orderStages';
import { getAvailableSlots, getRoute } from '../routes';
import { requireUser } from './auth';

/** Config metier exposee au client (sous-ensemble de `features`, aucun secret). */
function clientConfig() {
  return {
    displayName: features.displayName,
    fulfillment: features.fulfillment,
    requiresAddress: features.requiresAddress,
    requiresPhone: features.requiresPhone,
    deliverySlots: { enabled: features.deliverySlots.enabled },
    deliveryNote: features.deliveryNote,
    variants: features.variants,
    payment: features.payment,
    loyalty: features.loyalty.enabled
      ? { enabled: true, rewardLabel: features.loyalty.rewardLabel }
      : { enabled: false },
    referral: features.referral.enabled
      ? { enabled: true, filleulDiscount: features.referral.filleulDiscount }
      : { enabled: false },
  };
}

function cartDto(userId: number) {
  return { lines: getCart(userId), total: cartTotal(userId), count: cartCount(userId) };
}

export function shopRouter(telegram: Telegram): Router {
  const router = Router();
  router.use(requireUser);

  const uid = (req: { tgUser?: { id: number } }): number => req.tgUser!.id;

  // --- Catalogue + config ---
  router.get('/menu', (_req, res) => {
    res.json({ menu: getMenu(), config: clientConfig() });
  });

  // --- Panier ---
  router.get('/cart', (req, res) => res.json(cartDto(uid(req))));

  router.post('/cart', (req, res) => {
    const b = req.body ?? {};
    const catId = String(b.catId ?? '');
    const prodId = String(b.prodId ?? '');
    const variantId = b.variantId ? String(b.variantId) : undefined;
    const qty = Math.max(1, Math.min(99, Math.trunc(Number(b.qty) || 1)));
    if (!catId || !prodId) {
      res.status(400).json({ error: 'ref_invalide' });
      return;
    }
    // Verifie que la reference existe et est vendable telle quelle.
    const item = getMenu()[catId]?.items[prodId];
    const okRef =
      item &&
      (variantId
        ? item.variants.some((v) => v.id === variantId)
        : item.variants.length === 0);
    if (!okRef) {
      res.status(404).json({ error: 'produit_indisponible' });
      return;
    }
    addToCart(uid(req), { catId, prodId, variantId }, qty);
    res.json(cartDto(uid(req)));
  });

  router.patch('/cart', (req, res) => {
    const b = req.body ?? {};
    const key = String(b.key ?? '');
    const qty = Math.trunc(Number(b.qty));
    if (!key || Number.isNaN(qty)) {
      res.status(400).json({ error: 'params_invalides' });
      return;
    }
    setLineQty(uid(req), key, qty);
    res.json(cartDto(uid(req)));
  });

  router.delete('/cart', (req, res) => {
    clearCart(uid(req));
    res.json(cartDto(uid(req)));
  });

  // --- Recommander : re-remplit le panier depuis une commande passee ---
  router.post('/cart/reorder', (req, res) => {
    const orderId = Number(req.body?.orderId);
    const order = Number.isFinite(orderId) ? getOrder(orderId) : null;
    if (!order || order.user_id !== uid(req)) {
      res.status(404).json({ error: 'commande_introuvable' });
      return;
    }
    const menu = getMenu();
    const skipped: string[] = [];
    for (const l of order.items) {
      const item = menu[l.catId]?.items[l.prodId];
      const okRef =
        item &&
        (l.variantId
          ? item.variants.some((v) => v.id === l.variantId)
          : item.variants.length === 0);
      if (!okRef) {
        skipped.push(l.label);
        continue;
      }
      addToCart(uid(req), { catId: l.catId, prodId: l.prodId, variantId: l.variantId || undefined }, l.qty);
    }
    res.json({ ...cartDto(uid(req)), skipped });
  });

  // --- Creneaux (livraison) ---
  router.get('/slots', (_req, res) => {
    res.json({ slots: features.deliverySlots.enabled ? getAvailableSlots() : [] });
  });

  // --- Pre-remplissage du checkout ---
  router.get('/last-order', (req, res) => {
    const last = getLastOrder(uid(req));
    const cust = getCustomer(uid(req));
    res.json({
      address: last?.address ?? cust?.address ?? null,
      phone: last?.phone ?? cust?.phone ?? null,
      deliveryNote: last?.delivery_note ?? cust?.delivery_note ?? null,
    });
  });

  // --- Historique ---
  router.get('/orders', (req, res) => {
    const orders = getOrdersByUser(uid(req))
      .slice(0, 20)
      .map((o) => ({
        id: o.id,
        status: o.status,
        statusLabel: statusLabel(o.status),
        total: o.total,
        items: o.items,
        created_at: o.created_at,
      }));
    res.json({ orders });
  });

  // --- Validation d'une commande ---
  router.post('/orders', async (req, res) => {
    const b = req.body ?? {};
    const routeId = b.routeId != null ? Number(b.routeId) : null;

    const result = createClientOrder({
      userId: uid(req),
      username: req.tgUser!.username,
      address: b.address ? String(b.address).trim() : undefined,
      phone: b.phone ? String(b.phone).trim() : undefined,
      routeId: Number.isFinite(routeId) ? routeId : null,
      deliveryNote: b.deliveryNote ? String(b.deliveryNote).trim() : null,
    });

    if (!result.ok) {
      const code = result.reason === 'items_changed' ? 409 : 400;
      res.status(code).json({ error: result.reason, removed: result.removed });
      return;
    }

    // Confirmation dans le chat + notification admin (sens client -> admin).
    const route = result.order.route_id ? getRoute(result.order.route_id) : null;
    await safeSend(
      telegram,
      result.order.user_id,
      orderConfirmationText({
        orderId: result.orderId,
        total: result.total,
        referralDiscount: result.referralDiscount,
        slotLabel: route ? `${route.time_slot} (${route.date})` : 'au plus tôt',
      }),
      { parse_mode: 'HTML' },
    );
    if (result.parrainToNotify) {
      await safeSend(
        telegram,
        result.parrainToNotify.userId,
        `🎁 Ton filleul vient de passer sa première commande ! ${result.parrainToNotify.reward} € pour toi sur ta prochaine commande.`,
      );
    }
    await notifyNewOrder(telegram, result.order);

    res.json({ orderId: result.orderId, status: result.order.status });
  });

  return router;
}
