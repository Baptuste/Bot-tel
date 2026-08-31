/**
 * Mini-admin dans le bot : commandes `/admin` + boutons de transition.
 *
 * Toute la logique (transitions, notifications) vit dans `orderFlow.ts`.
 * Ici on ne fait que l'UI Telegram cote admin.
 */
import { Markup, type Telegraf } from 'telegraf';
import { config } from './config';
import { userId, type BotContext } from './context';
import { changeStatus, orderKeyboard, renderOrderText } from './orderFlow';
import { orderStages, stageById, statusLabel } from './orderStages';
import { getOpenOrders, getStatusCounts, type OrderStatus } from './orders';
import { markDelivered } from './routes';

export function isAdmin(id: number): boolean {
  return config.adminIds.includes(id);
}

/** Enregistre les commandes et le listener admin sur le bot. */
export function registerAdmin(bot: Telegraf<BotContext>): void {
  bot.command('admin', async (ctx) => {
    if (!isAdmin(userId(ctx))) return; // silencieux pour les non-admins

    const c = getStatusCounts();
    const open = getOpenOrders();
    // Recap par etape du pipeline (s'adapte a features.orderFlow).
    const countLines = orderStages()
      .map((s) => `${s.label[0]!.toUpperCase()}${s.label.slice(1)} : ${c[s.id] ?? 0}`)
      .join('\n');
    await ctx.reply(
      '📊 Tableau de bord\n\n' +
        `${countLines}\n\n` +
        (open.length > 0
          ? `${open.length} commande(s) a traiter (voir ci-dessous) :`
          : 'Aucune commande en cours. 🎉'),
      config.webAppUrl
        ? Markup.inlineKeyboard([
            [Markup.button.webApp("🖥 Ouvrir l'admin (Mini App)", config.webAppUrl)],
          ])
        : undefined,
    );
    for (const order of open.slice(0, 15)) {
      await ctx.reply(renderOrderText(order), orderKeyboard(order));
    }
  });

  bot.action(/^adm:status:(\d+):(\w+)$/, async (ctx) => {
    if (!isAdmin(userId(ctx))) {
      await ctx.answerCbQuery("Reserve a l'admin");
      return;
    }
    const orderId = Number(ctx.match?.[1] ?? 0);
    const to = (ctx.match?.[2] ?? '') as OrderStatus;

    // Passage a l'etape finale -> markDelivered gere aussi la progression de la tournee.
    const order =
      stageById(to)?.role === 'fulfilled'
        ? await markDelivered(ctx.telegram, orderId)
        : await changeStatus(ctx.telegram, orderId, to);

    await ctx.answerCbQuery(
      order ? `Commande #${orderId} : ${statusLabel(to)}` : 'Commande introuvable',
    );

    if (order) {
      try {
        await ctx.editMessageText(renderOrderText(order), orderKeyboard(order));
      } catch {
        /* message identique ou trop vieux pour etre edite */
      }
    }
  });
}
