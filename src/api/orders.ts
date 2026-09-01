/**
 * API commandes pour la Mini App admin.
 *
 * Toute la logique metier reste dans `orders.ts` / `admin.ts` : ces routes ne
 * font que valider l'entree, appeler la bonne fonction et renvoyer du JSON.
 * `changeStatus()` est le meme point de passage que pour les boutons du bot.
 */
import { Router } from 'express';
import type { Telegram } from 'telegraf';
import { resolveMenuItems } from '../catalog';
import { getCustomer } from '../customers';
import { features } from '../features';
import { loyaltyStatus } from '../modules/loyalty';
import { getReliability } from '../modules/reliability';
import { changeStatus, nextStatuses, safeSend } from '../orderFlow';
import { stageById } from '../orderStages';
import {
  EDITABLE_STATUSES,
  getOrder,
  getRecentOrders,
  getStatusCounts,
  setOrderRoute,
  updateOrderDetails,
  type Order,
  type OrderStatus,
} from '../orders';
import { getRoute, markDelivered } from '../routes';
import type { CartLine } from '../types';
import { requireAdmin } from './auth';

/** Ce qu'on expose au front pour une commande (+ creneau + resume client). */
function toDto(order: Order) {
  const route = order.route_id ? getRoute(order.route_id) : null;
  const customer = getCustomer(order.user_id);
  const r = features.reliability.enabled ? getReliability(order.user_id) : null;
  return {
    ...order,
    next: nextStatuses(order.status),
    route: route
      ? { id: route.id, date: route.date, label: route.time_slot, status: route.status }
      : null,
    customer: {
      name: customer?.name ?? null,
      blocked: customer?.blocked ?? false,
      delivery_note: customer?.delivery_note ?? null,
      reliability: r ? { delivered: r.delivered, noShow: r.noShow, rate: r.rate } : null,
      loyalty: features.loyalty.enabled
        ? { rewardsAvailable: loyaltyStatus(order.user_id).rewardsAvailable }
        : null,
    },
  };
}

export function ordersRouter(telegram: Telegram): Router {
  const router = Router();
  router.use(requireAdmin);

  // Liste + compteurs par statut.
  router.get('/', (_req, res) => {
    res.json({
      orders: getRecentOrders(200).map(toDto),
      counts: getStatusCounts(),
    });
  });

  router.get('/:id', (req, res) => {
    const order = getOrder(Number(req.params.id));
    if (!order) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ order: toDto(order) });
  });

  // Modification par l'admin (commande pending / confirmed) : adresse, precision,
  // creneau, articles. Le total est recalcule cote serveur (prix courants).
  router.patch('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const current = getOrder(id);
    if (!current) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (!EDITABLE_STATUSES.includes(current.status)) {
      res.status(409).json({ error: 'not_editable', status: current.status });
      return;
    }

    const b = req.body ?? {};
    const patch: { address?: string; deliveryNote?: string | null; items?: CartLine[] } = {};

    if (b.address !== undefined) {
      const a = String(b.address).trim();
      if (a.length < 5) {
        res.status(400).json({ error: 'invalid_address' });
        return;
      }
      patch.address = a;
    }
    if (b.delivery_note !== undefined) {
      patch.deliveryNote = String(b.delivery_note).trim() || null;
    }
    if (Array.isArray(b.items)) {
      const { items, missing } = resolveMenuItems(b.items);
      if (missing > 0) {
        res.status(400).json({ error: 'unknown_items', missing });
        return;
      }
      if (items.length === 0) {
        res.status(400).json({ error: 'empty_items' });
        return;
      }
      patch.items = items;
    }

    if (b.route_id !== undefined) {
      const routeId = b.route_id === null ? null : Number(b.route_id);
      if (routeId !== null && !getRoute(routeId)) {
        res.status(400).json({ error: 'unknown_route' });
        return;
      }
      setOrderRoute(id, routeId);
    }

    const updated = updateOrderDetails(id, patch);
    if (updated && b.notify) {
      await safeSend(
        telegram,
        updated.user_id,
        `✏️ Ta commande #${updated.id} a été mise à jour. Nouveau total : ${updated.total} €.`,
        undefined,
        { alertAdmins: true, context: `commande #${updated.id} · modification` },
      );
    }
    res.json({ order: updated ? toDto(updated) : null });
  });

  // Changement de statut (notifie le client via changeStatus).
  router.post('/:id/status', async (req, res) => {
    const id = Number(req.params.id);
    const to = String(req.body?.status ?? '') as OrderStatus;

    const current = getOrder(id);
    if (!current) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (!nextStatuses(current.status).some((s) => s.to === to)) {
      res.status(409).json({ error: 'invalid_transition', from: current.status });
      return;
    }

    const role = stageById(to)?.role;
    let updated: Awaited<ReturnType<typeof changeStatus>>;
    if (role === 'fulfilled') {
      // Étape finale : markDelivered fait aussi avancer le suivi de la tournée.
      updated = await markDelivered(telegram, id);
    } else {
      const meta =
        role === 'cancelled'
          ? {
              reason: req.body?.reason ? String(req.body.reason) : undefined,
              noShow: Boolean(req.body?.no_show),
            }
          : undefined;
      updated = await changeStatus(telegram, id, to, meta);
    }
    res.json({ order: updated ? toDto(updated) : null });
  });

  // Message libre au client, envoye par le bot.
  router.post('/:id/message', async (req, res) => {
    const order = getOrder(Number(req.params.id));
    const text = String(req.body?.text ?? '').trim();
    if (!order) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (!text) {
      res.status(400).json({ error: 'empty_message' });
      return;
    }
    try {
      await telegram.sendMessage(order.user_id, `💬 ${text}`);
      res.json({ ok: true });
    } catch {
      res.status(502).json({ error: 'delivery_failed' });
    }
  });

  return router;
}
