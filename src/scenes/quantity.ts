/**
 * Scene "quantite" : le seul moment de la V1 ou le bot attend une reponse
 * en texte libre du client.
 *
 * Flux :
 *   1. on entre dans la scene avec le produit vise (passe via `ctx.scene.state`) ;
 *   2. le bot demande "combien ?" ;
 *   3. a la reception d'un nombre valide (1-99), on ajoute au panier et on sort ;
 *   4. tout autre message -> on redemande.
 *
 * La scene se quitte proprement (`ctx.scene.leave()`) des que l'info est recuperee.
 */
import { Scenes } from 'telegraf';
import { message } from 'telegraf/filters';
import { userId, type BotContext, type QuantityState } from '../context';
import { addToCart } from '../cart';
import { cartView } from '../views';

export const QUANTITY_SCENE_ID = 'quantity';

const MIN_QTY = 1;
const MAX_QTY = 99;

export const quantityScene = new Scenes.BaseScene<BotContext>(QUANTITY_SCENE_ID);

quantityScene.enter(async (ctx) => {
  const { label } = ctx.scene.state as QuantityState;
  await ctx.reply(
    `Combien de « ${label} » ?\n` +
      `Envoie un nombre entre ${MIN_QTY} et ${MAX_QTY} (ou /annuler).`,
  );
});

quantityScene.command('annuler', async (ctx) => {
  await ctx.reply('Ajout annule.');
  await ctx.scene.leave();
});

quantityScene.on(message('text'), async (ctx) => {
  const raw = ctx.message.text.trim();
  const qty = Number(raw);

  const isValid =
    /^\d+$/.test(raw) && Number.isInteger(qty) && qty >= MIN_QTY && qty <= MAX_QTY;

  if (!isValid) {
    await ctx.reply(`Merci d'envoyer un nombre entier entre ${MIN_QTY} et ${MAX_QTY}.`);
    return;
  }

  const { catId, prodId, variantId, label, price } = ctx.scene.state as QuantityState;
  const uid = userId(ctx);
  addToCart(uid, { catId, prodId, variantId, label, price }, qty);

  await ctx.reply(`✅ ${qty} x ${label} ajoute au panier.`);
  await ctx.scene.leave();

  // On enchaine directement sur le recapitulatif du panier.
  const view = cartView(uid);
  await ctx.reply(view.text, { parse_mode: 'Markdown', ...view.keyboard });
});

// Tout autre type de message pendant la scene.
quantityScene.on('message', async (ctx) => {
  await ctx.reply(`Envoie un nombre entre ${MIN_QTY} et ${MAX_QTY}, ou /annuler.`);
});
