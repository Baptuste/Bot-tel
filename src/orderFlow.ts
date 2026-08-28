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
import { getCustomer, getReliability } from './customers';
import {
  getOrder,
  STATUS_LABEL,
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

const TRANSITIONS: Record<OrderStatus, Transition[]> = {
  pending: [
    {
      to: 'confirmed',
      adminLabel: '✅ Confirmer',
      clientMsg: (o) => `✅ Ta commande #${o.id} est confirmee !\nLivraison estimee : ~45 minutes.`,
    },
    {
      to: 'cancelled',
      adminLabel: '❌ Refuser',
      clientMsg: (o) =>
        `❌ Ta commande #${o.id} n'a pas pu etre acceptee. Contacte-nous pour en savoir plus.`,
    },
  ],
  confirmed: [
    {
      to: 'delivering',
      adminLabel: '🛵 En livraison',
      clientMsg: (o) => `🛵 Ta commande #${o.id} est en route !`,
    },
    {
      to: 'cancelled',
      adminLabel: '❌ Annuler',
      clientMsg: (o) => `❌ Ta commande #${o.id} a ete annulee. Contacte-nous pour en savoir plus.`,
    },
  ],
  delivering: [
    {
      to: 'delivered',
      adminLabel: '📦 Livree',
      clientMsg: (o) => `📦 Ta commande #${o.id} a ete livree. Bon appetit ! 🍽`,
    },
    {
      to: 'cancelled',
      adminLabel: '❌ Souci',
      clientMsg: (o) => `❌ Ta commande #${o.id} a ete annulee. Contacte-nous pour en savoir plus.`,
    },
  ],
  delivered: [],
  cancelled: [],
};

export interface StatusOption {
  to: OrderStatus;
  label: string;
}

/** Transitions possibles depuis un statut (partagees par le bot ET la Mini App). */
export function nextStatuses(status: OrderStatus): StatusOption[] {
  return TRANSITIONS[status].map((t) => ({ to: t.to, label: t.adminLabel }));
}

/** Ligne d'alerte sur le client (bloque / no-show), vide s'il est fiable ou nouveau. */
function customerFlag(userId: number): string {
  const customer = getCustomer(userId);
  if (customer?.blocked) return '🚫 CLIENT BLOQUE (liste noire)\n';
  const r = getReliability(userId);
  if (r.noShow > 0) {
    const pct = r.rate === null ? '?' : Math.round(r.rate * 100);
    return `⚠️ Fiabilite : ${r.delivered} livrees / ${r.noShow} no-show (${pct}%)\n`;
  }
  return '';
}

/** Rendu texte d'une commande (notifications admin). */
export function renderOrderText(o: Order): string {
  const items = o.items.map((l) => `  - ${l.label} x${l.qty}  (${l.price * l.qty} EUR)`).join('\n');
  const who = o.username ? `@${o.username}` : `id ${o.user_id}`;
  return (
    `Commande #${o.id} - ${STATUS_LABEL[o.status]}\n` +
    customerFlag(o.user_id) +
    `Client : ${who}\n` +
    (o.phone ? `Tel : ${o.phone}\n` : '') +
    (o.address ? `Adresse : ${o.address}\n` : 'Retrait en boutique\n') +
    (o.delivery_note ? `Precision : ${o.delivery_note}\n` : '') +
    `${items}\n` +
    `Total : ${o.total} EUR\n` +
    (o.cancellation_reason ? `Annulation : ${o.cancellation_reason}\n` : '') +
    `Passee le ${o.created_at} UTC`
  );
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

  const transition = TRANSITIONS[current.status].find((t) => t.to === to);
  if (!transition) return current; // transition non autorisee -> on ne fait rien

  const updated = updateOrderStatus(orderId, to, meta);
  if (updated) {
    await safeSend(telegram, updated.user_id, transition.clientMsg(updated));
  }
  return updated;
}

/** Previent les admins qu'une nouvelle commande vient d'arriver. */
export async function notifyNewOrder(telegram: Telegram, order: Order): Promise<void> {
  if (config.adminIds.length === 0) return;
  const text = `🔔 Nouvelle commande #${order.id}\n\n${renderOrderText(order)}`;
  for (const adminId of config.adminIds) {
    await safeSend(telegram, adminId, text, orderKeyboard(order));
  }
}
