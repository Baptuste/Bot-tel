/**
 * Coeur du cycle de vie d'une commande, independant de toute UI.
 *
 * `changeStatus()` est le POINT DE PASSAGE UNIQUE des transitions : il valide,
 * met a jour la base et notifie le client. Le bot ET la Mini App passent par la.
 *
 * (Extrait de `admin.ts` pour casser le cycle admin <-> routes : `routes.ts` a
 * besoin de `changeStatus`, et `admin.ts` a besoin de `routes.ts` pour le suivi
 * de tournee -> tout le monde depend de ce module, qui ne depend de personne.)
 */
import { Markup, type Telegram } from 'telegraf';
import { config } from './config';
import { getCustomer } from './customers';
import { features, type OrderFlowConfig } from './features';
import { awardForOrder, loyaltyStatus } from './modules/loyalty';
import { getReliability } from './modules/reliability';
import { stageById, statusLabel } from './orderStages';
import {
  getOrder,
  updateOrderStatus,
  type CancellationMeta,
  type Order,
  type OrderStatus,
} from './orders';

/** Envoie un message, en tolerant les cas normaux (client a bloque le bot / compte supprime). */
export async function safeSend(
  telegram: Telegram,
  chatId: number,
  text: string,
  extra?: Parameters<Telegram['sendMessage']>[2],
): Promise<void> {
  try {
    await telegram.sendMessage(chatId, text, extra);
  } catch (err) {
    const description = (err as { description?: string }).description ?? String(err);
    if (/chat not found|bot was blocked|user is deactivated/i.test(description)) {
      console.warn(`[flow] client ${chatId} injoignable (${description}).`);
    } else {
      console.error(`[flow] envoi au client ${chatId} echoue :`, err);
    }
  }
}

interface Transition {
  to: OrderStatus;
  adminLabel: string;
  clientMsg: (o: Order) => string;
}

/** Construit la table des transitions (linéaire + annulation) à partir de la config. */
function buildTransitions(cfg: OrderFlowConfig): Record<string, Transition[]> {
  const cancelStage = cfg.stages.find((s) => s.role === 'cancelled')!;
  const linear = cfg.stages.filter((s) => s.role !== 'cancelled');
  const fill = (tpl: string, o: Order) => tpl.replace('{id}', String(o.id));

  const out: Record<string, Transition[]> = { [cancelStage.id]: [] };
  linear.forEach((stage, i) => {
    const transitions: Transition[] = [];
    const next = linear[i + 1];
    if (next?.advanceLabel && next.arrivalMessage) {
      const msg = next.arrivalMessage;
      transitions.push({ to: next.id, adminLabel: next.advanceLabel, clientMsg: (o) => fill(msg, o) });
    }
    if (stage.cancelLabel && stage.cancelMessage) {
      const msg = stage.cancelMessage;
      transitions.push({
        to: cancelStage.id,
        adminLabel: stage.cancelLabel,
        clientMsg: (o) => fill(msg, o),
      });
    }
    out[stage.id] = transitions;
  });
  return out;
}

const TRANSITIONS: Record<string, Transition[]> = buildTransitions(features.orderFlow);

export interface StatusOption {
  to: OrderStatus;
  label: string;
}

/** Transitions possibles depuis un statut (partagees par le bot ET la Mini App). */
export function nextStatuses(status: OrderStatus): StatusOption[] {
  return (TRANSITIONS[status] ?? []).map((t) => ({ to: t.to, label: t.adminLabel }));
}

/** Ligne d'alerte sur le client (bloque / no-show), vide s'il est fiable ou nouveau. */
function customerFlag(userId: number): string {
  const customer = getCustomer(userId);
  if (customer?.blocked) return '🚫 CLIENT BLOQUÉ (liste noire)\n';
  if (!features.reliability.enabled) return '';
  const r = getReliability(userId);
  if (r.noShow > 0) {
    const pct = r.rate === null ? '?' : Math.round(r.rate * 100);
    return `⚠️ Fiabilité : ${r.delivered} livrées / ${r.noShow} no-show (${pct} %)\n`;
  }
  return '';
}

/** Rendu texte d'une commande (notifications admin). */
export function renderOrderText(o: Order): string {
  const items = o.items.map((l) => `  •  ${l.label} ×${l.qty}   ${l.price * l.qty} EUR`).join('\n');
  const who = o.username ? `@${o.username}` : `id ${o.user_id}`;
  return (
    `Commande #${o.id} — ${statusLabel(o.status)}\n` +
    customerFlag(o.user_id) +
    `👤 ${who}\n` +
    (o.phone ? `📞 ${o.phone}\n` : '') +
    (o.address ? `📍 ${o.address}\n` : '🏬 Retrait en boutique\n') +
    (o.delivery_note ? `📝 ${o.delivery_note}\n` : '') +
    `\n${items}\n` +
    `Total : ${o.total} EUR\n` +
    loyaltyFlag(o.user_id) +
    (o.cancellation_reason ? `⚠️ Annulation : ${o.cancellation_reason}\n` : '') +
    `\nPassée le ${o.created_at} UTC`
  );
}

/** Ligne « récompense fidélité à appliquer » sur la commande (vide sinon). */
function loyaltyFlag(userId: number): string {
  if (!features.loyalty.enabled) return '';
  const s = loyaltyStatus(userId);
  return s.rewardsAvailable > 0
    ? `🎁 Récompense fidélité à appliquer : ${s.rewardLabel} (${s.points} pts)\n`
    : '';
}

/** Clavier inline des transitions possibles pour une commande (bot). */
export function orderKeyboard(o: Order) {
  const rows = nextStatuses(o.status).map((s) => [
    Markup.button.callback(s.label, `adm:status:${o.id}:${s.to}`),
  ]);
  return rows.length > 0 ? Markup.inlineKeyboard(rows) : undefined;
}

/**
 * Point de passage UNIQUE d'un changement de statut : valide la transition,
 * met a jour la base, notifie le client.
 */
export async function changeStatus(
  telegram: Telegram,
  orderId: number,
  to: OrderStatus,
  meta?: CancellationMeta,
): Promise<Order | null> {
  const current = getOrder(orderId);
  if (!current) return null;

  const transition = (TRANSITIONS[current.status] ?? []).find((t) => t.to === to);
  if (!transition) return current; // transition non autorisee -> on ne fait rien

  const updated = updateOrderStatus(orderId, to, meta);
  if (updated) {
    await safeSend(telegram, updated.user_id, transition.clientMsg(updated));
    if (features.loyalty.enabled && stageById(to)?.role === 'fulfilled') {
      await awardLoyalty(telegram, updated);
    }
  }
  return updated;
}

/** Crédite les points de fidélité d'une commande servie et notifie au palier. */
async function awardLoyalty(telegram: Telegram, order: Order): Promise<void> {
  const { status, crossedThreshold } = awardForOrder(order.user_id);
  if (crossedThreshold) {
    await safeSend(
      telegram,
      order.user_id,
      `🎉 ${status.points} points de fidélité ! Tu as débloqué : ${status.rewardLabel}.\n` +
        'Signale-le à ta prochaine commande.',
    );
  }
}

/** Previent les admins qu'une nouvelle commande vient d'arriver. */
export async function notifyNewOrder(telegram: Telegram, order: Order): Promise<void> {
  if (config.adminIds.length === 0) return;
  const text = `🔔 Nouvelle commande #${order.id}\n\n${renderOrderText(order)}`; // "Nouvelle commande #" : verifie par les tests
  for (const adminId of config.adminIds) {
    await safeSend(telegram, adminId, text, orderKeyboard(order));
  }
}
