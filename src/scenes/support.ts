/**
 * Scenes du relais de messagerie (cf. src/support.ts).
 *  - `supportScene`      : le CLIENT ecrit a la boutique.
 *  - `supportReplyScene` : l'ADMIN repond a un client (entree depuis le bouton
 *                          « Répondre » du message transmis).
 */
import { Markup, Scenes } from 'telegraf';
import { message } from 'telegraf/filters';
import { userId, type BotContext } from '../context';
import { relayAdminReply, relayClientMessage, supportAvailable } from '../support';

export const SUPPORT_SCENE_ID = 'support';
export const SUPPORT_REPLY_SCENE_ID = 'support-reply';

const leave = async (ctx: BotContext, msg: string): Promise<void> => {
  await ctx.reply(msg);
  await ctx.scene.leave();
};

// --- Côté client : écrire à la boutique ---------------------------------

export const supportScene = new Scenes.BaseScene<BotContext>(SUPPORT_SCENE_ID);

supportScene.enter(async (ctx) => {
  if (!supportAvailable()) {
    await leave(ctx, "La messagerie n'est pas disponible pour le moment.");
    return;
  }
  await ctx.reply(
    '✍️ Écris ton message pour la boutique — il sera transmis, on te répond ici.',
    Markup.inlineKeyboard([[Markup.button.callback('Annuler', 'support:cancel')]]),
  );
});

supportScene.action('support:cancel', async (ctx) => {
  await ctx.answerCbQuery();
  await leave(ctx, 'Annulé.');
});
supportScene.command('annuler', (ctx) => leave(ctx, 'Annulé.'));

supportScene.on(message('text'), async (ctx) => {
  const text = ctx.message.text.trim();
  if (!text || text.startsWith('/')) return;
  await relayClientMessage(
    ctx.telegram,
    {
      id: userId(ctx),
      username: ctx.from?.username,
      name: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || undefined,
    },
    text,
  );
  await leave(ctx, '✅ Message transmis. On te répond bientôt, ici même.');
});

supportScene.on('message', (ctx) => ctx.reply('Écris ton message en texte, ou tape /annuler.'));

// --- Côté admin : répondre à un client ---------------------------------

export const supportReplyScene = new Scenes.BaseScene<BotContext>(SUPPORT_REPLY_SCENE_ID);

supportReplyScene.enter(async (ctx) => {
  const { clientId } = ctx.scene.state as { clientId?: number };
  if (!clientId) {
    await ctx.scene.leave();
    return;
  }
  await ctx.reply(`↩️ Ta réponse au client <code>${clientId}</code> (ou /annuler) :`, {
    parse_mode: 'HTML',
  });
});

supportReplyScene.command('annuler', (ctx) => leave(ctx, 'Annulé.'));

supportReplyScene.on(message('text'), async (ctx) => {
  const { clientId } = ctx.scene.state as { clientId?: number };
  const text = ctx.message.text.trim();
  if (!clientId || !text || text.startsWith('/')) return;
  await relayAdminReply(ctx.telegram, clientId, text);
  await leave(ctx, '✅ Envoyé au client.');
});
