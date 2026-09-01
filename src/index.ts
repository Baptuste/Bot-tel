/**
 * Point d'entree : demarre le bot Telegram ET le serveur HTTP (API + Mini App),
 * dans le meme process.
 *
 * Bot client : /start -> menu -> panier -> checkout -> commande persistee (SQLite).
 * Mini-admin bot : /admin (tableau de bord + transitions de statut + notifs client).
 * Mini App admin : servie par src/server.ts (auth initData), ouverte via un bouton.
 */
import 'dotenv/config'; // AVANT './db' et './features' : CLIENT_ID / DB_PATH lus a l'import
import { Markup, Scenes, Telegraf, session } from 'telegraf';
import './db'; // ouvre la base + cree les tables au demarrage
import { registerAdmin } from './admin';
import { config } from './config';
import { createServer } from './server';
import { features } from './features';
import { userId, type BotContext, type QuantityState } from './context';
import { CALLBACK_PATTERN, parseCallback } from './callbacks';
import { clearCart, getCart, lineKey, removeLine, setLineQty } from './cart';
import { getMenu, seedCatalogIfEmpty } from './catalog';
import { seedMessageTemplatesIfEmpty } from './messageTemplates';
import { loyaltyStatus } from './modules/loyalty';
import { referralInfo, registerFilleul } from './modules/referral';
import { statusLabel } from './orderStages';
import { getOrdersByUser } from './orders';
import { seedDefaultTemplatesIfEmpty } from './routes';
import { startScheduler } from './scheduler';
import { sqliteSessionStore } from './sessionStore';
import { QUANTITY_SCENE_ID, quantityScene } from './scenes/quantity';
import { CHECKOUT_SCENE_ID, checkoutScene } from './scenes/checkout';
import { SUPPORT_SCENE_ID, supportScene, supportReplyScene } from './scenes/support';
import {
  cartView,
  categoriesView,
  categoryView,
  contactView,
  esc,
  isPhotoView,
  productView,
  section,
  TAGLINE,
  type AnyView,
} from './views';

// 1er demarrage : importe menu.json + cree les modeles de tournees par defaut.
seedCatalogIfEmpty();
if (features.deliverySlots.enabled) seedDefaultTemplatesIfEmpty();
if (features.messaging.templatesEnabled) seedMessageTemplatesIfEmpty();
getMenu();

const bot = new Telegraf<BotContext>(config.botToken);

const stage = new Scenes.Stage<BotContext>([
  quantityScene,
  checkoutScene,
  supportScene,
  supportReplyScene,
]);
// Sessions persistees en base : un checkout en cours survit a un redemarrage du bot.
bot.use(session({ store: sqliteSessionStore }));
bot.use(stage.middleware());

/** Le message d'ou vient le clic est-il une photo ? (on ne peut pas l'editer en texte) */
function fromPhotoMessage(ctx: BotContext): boolean {
  const msg = ctx.callbackQuery && 'message' in ctx.callbackQuery ? ctx.callbackQuery.message : null;
  return !!msg && 'photo' in msg;
}

/**
 * Affiche une vue (texte ou photo).
 *  - clic sur un bouton, vue texte <-> texte : on EDITE le message (pas d'empilement) ;
 *  - des qu'une photo est impliquee : on remplace le message (Telegram ne sait pas
 *    transformer proprement un message texte <-> photo dans tous les cas).
 */
async function render(ctx: BotContext, view: AnyView): Promise<void> {
  const photo = isPhotoView(view);
  const fromCallback = ctx.updateType === 'callback_query';

  if (fromCallback && !photo && !fromPhotoMessage(ctx)) {
    try {
      await ctx.editMessageText(view.text, { parse_mode: 'HTML', ...view.keyboard });
      return;
    } catch (err) {
      const description = (err as { description?: string }).description ?? '';
      if (description.includes('message is not modified')) return;
    }
  } else if (fromCallback) {
    await ctx.deleteMessage().catch(() => undefined);
  }

  if (photo) {
    const src = Buffer.isBuffer(view.photo) ? { source: view.photo } : { source: view.photo };
    await ctx.replyWithPhoto(src, {
      caption: view.caption,
      parse_mode: 'HTML',
      ...view.keyboard,
    });
  } else {
    await ctx.reply(view.text, { parse_mode: 'HTML', ...view.keyboard });
  }
}

bot.start(async (ctx) => {
  // Accueil sobre : nom + tagline, removeKeyboard (nettoie un ancien clavier
  // personnalise), puis la carte. Le bouton "🛍️ Ouvrir la boutique" (Mini App
  // client) est porte par categoriesView() quand WEBAPP_URL est configuree.
  await ctx.reply(`<b>${esc(features.displayName)}</b>\n<i>${esc(TAGLINE)}</i>`, {
    parse_mode: 'HTML',
    ...Markup.removeKeyboard(),
  });
  await render(ctx, categoriesView());
});

bot.command('panier', async (ctx) => {
  await render(ctx, cartView(userId(ctx)));
});

bot.command('contact', async (ctx) => {
  await render(ctx, contactView());
});

bot.help(async (ctx) => {
  const lines = [
    '<code>/start</code> — afficher la carte',
    '<code>/panier</code> — voir mon panier',
    '<code>/mes_commandes</code> — mon historique de commandes',
    '<code>/contact</code> — joindre la boutique',
  ];
  if (features.loyalty.enabled) lines.push('<code>/fidelite</code> — mes points de fidélité');
  if (features.referral.enabled) lines.push('<code>/parrainage</code> — mon code de parrainage');
  await ctx.reply(`${section('Aide')}\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
});

// Helper de configuration : donne son propre user_id (a mettre dans ADMIN_IDS).
bot.command('id', async (ctx) => {
  await ctx.reply(`Ton identifiant Telegram : ${userId(ctx)}`);
});

bot.command('mes_commandes', async (ctx) => {
  const orders = getOrdersByUser(userId(ctx));
  if (orders.length === 0) {
    await ctx.reply("Tu n'as pas encore passe de commande.");
    return;
  }
  const text = orders
    .slice(0, 10)
    .map((o) => {
      const items = esc(o.items.map((l) => `${l.label} ×${l.qty}`).join(', '));
      return `<b>#${o.id}</b> · <i>${esc(statusLabel(o.status))}</i>\n${items}\n${o.total} € — ${o.created_at}`;
    })
    .join('\n\n');
  await ctx.reply(`${section('Tes dernières commandes')}\n\n${text}`, { parse_mode: 'HTML' });
});

if (features.loyalty.enabled) {
  bot.command('fidelite', async (ctx) => {
    const s = loyaltyStatus(userId(ctx));
    const reward = esc(s.rewardLabel);
    const line =
      s.rewardsAvailable > 0
        ? `🎁 Tu as ${s.rewardsAvailable} récompense(s) : <b>${reward}</b>. Signale-le en commandant !`
        : `Plus que <b>${s.toNextReward}</b> point(s) pour : ${reward}.`;
    await ctx.reply(
      `${section('⭐ Fidélité')}\n\nSolde : <b>${s.points}</b> point(s).\n${line}`,
      { parse_mode: 'HTML' },
    );
  });
}

if (features.referral.enabled) {
  const REGISTER_ERR: Record<string, string> = {
    code_invalide: "Ce code n'existe pas.",
    auto_parrainage: 'Tu ne peux pas utiliser ton propre code.',
    parrain_inconnu: "Ce code n'existe pas.",
    deja_parraine: 'Tu as déjà un code de parrainage enregistré.',
    trop_tard: 'Le parrainage est réservé à ta toute première commande.',
  };
  bot.command('parrainage', async (ctx) => {
    const uid = userId(ctx);
    const arg = ctx.message.text.split(/\s+/)[1]?.trim();
    if (arg) {
      const res = registerFilleul(uid, arg);
      await ctx.reply(
        res.ok
          ? `✅ Code accepté ! ${referralInfo(uid).filleulDiscount} € de réduction sur ta première commande.`
          : `❌ ${REGISTER_ERR[res.reason] ?? 'Code refusé.'}`,
      );
      return;
    }
    const info = referralInfo(uid);
    const parts = [
      `${section('👥 Parrainage')}\n\nTon code : <code>${esc(info.code)}</code>`,
      `Partage-le : à sa 1re commande avec ton code, ton filleul a <b>${info.filleulDiscount} €</b> ` +
        `de réduction, et toi <b>${info.parrainReward} €</b> sur ta commande suivante.`,
    ];
    if (info.filleulsCompleted > 0) parts.push(`Filleuls actifs : ${info.filleulsCompleted}.`);
    if (info.creditAvailable > 0) {
      parts.push(
        `🎁 Tu as ${info.creditAvailable} € de crédit parrain, appliqué à ta prochaine commande.`,
      );
    }
    await ctx.reply(parts.join('\n\n'), { parse_mode: 'HTML' });
  });
}

// Commandes + listener admin (gates par ADMIN_IDS).
registerAdmin(bot);

// Bouton "libelle" du panier : pas d'action, on explique juste les commandes voisines.
bot.action('noop', (ctx) => ctx.answerCbQuery('Utilise ➖ / ➕ pour ajuster la quantité'));

// « Écrire à la boutique » -> scene de relais client -> admin.
bot.action('support:start', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SUPPORT_SCENE_ID);
});

// --- Un SEUL listener generique pour toute la navigation par boutons ---
bot.action(CALLBACK_PATTERN, async (ctx) => {
  // answerCbQuery() systematique : enleve le "sablier" affiche sur le bouton.
  await ctx.answerCbQuery();

  const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
  const parsed = parseCallback(data);
  const uid = userId(ctx);

  switch (parsed.kind) {
    case 'home':
      await render(ctx, categoriesView());
      return;

    case 'contact':
      await render(ctx, contactView());
      return;

    case 'category': {
      const view = categoryView(parsed.catId);
      await render(ctx, view ?? categoriesView());
      return;
    }

    case 'product': {
      const view = productView(parsed.catId, parsed.prodId);
      await render(ctx, view ?? categoriesView());
      return;
    }

    case 'addToCart': {
      const item = getMenu()[parsed.catId]?.items[parsed.prodId];
      if (!item) {
        await render(ctx, categoriesView());
        return;
      }
      // Produit devenu "a tailles" entre-temps : on renvoie vers le choix de taille.
      if (item.variants.length > 0) {
        await render(ctx, productView(parsed.catId, parsed.prodId) ?? categoriesView());
        return;
      }
      const state: QuantityState = {
        catId: parsed.catId,
        prodId: parsed.prodId,
        label: item.label,
        price: item.price,
      };
      await ctx.scene.enter(QUANTITY_SCENE_ID, state);
      return;
    }

    case 'addVariant': {
      const item = getMenu()[parsed.catId]?.items[parsed.prodId];
      const variant = item?.variants.find((v) => v.id === parsed.variantId);
      if (!item || !variant) {
        await render(ctx, categoriesView());
        return;
      }
      const state: QuantityState = {
        catId: parsed.catId,
        prodId: parsed.prodId,
        variantId: variant.id,
        label: `${item.label} - ${variant.label}`,
        price: variant.price,
      };
      await ctx.scene.enter(QUANTITY_SCENE_ID, state);
      return;
    }

    case 'lineInc': {
      const line = getCart(uid).find((l) => lineKey(l.catId, l.prodId, l.variantId) === parsed.key);
      if (line) setLineQty(uid, parsed.key, line.qty + 1);
      await render(ctx, cartView(uid));
      return;
    }

    case 'lineDec': {
      const line = getCart(uid).find((l) => lineKey(l.catId, l.prodId, l.variantId) === parsed.key);
      if (line) setLineQty(uid, parsed.key, line.qty - 1);
      await render(ctx, cartView(uid));
      return;
    }

    case 'lineDel':
      removeLine(uid, parsed.key);
      await render(ctx, cartView(uid));
      return;

    case 'showCart':
      await render(ctx, cartView(uid));
      return;

    case 'clearCart':
      clearCart(uid);
      await render(ctx, cartView(uid));
      return;

    case 'startCheckout':
      await ctx.scene.enter(CHECKOUT_SCENE_ID);
      return;

    default:
      // callback_data inconnue (ancien bouton, bug) : on ramene a l'accueil.
      await render(ctx, categoriesView());
  }
});

bot.catch((err, ctx) => {
  console.error(`[bot.catch] erreur sur update ${ctx.updateType} :`, err);
});

/**
 * Declare les commandes aupres de Telegram -> elles apparaissent dans le menu
 * "☰" a cote de la zone de saisie (et remplacent l'ecran "START" initial).
 * Les admins voient en plus /admin (commandes limitees a leur conversation).
 */
async function publishCommands(): Promise<void> {
  const base = [
    { command: 'start', description: 'Afficher le menu' },
    { command: 'panier', description: 'Voir mon panier' },
    { command: 'mes_commandes', description: 'Mon historique de commandes' },
    { command: 'contact', description: 'Joindre la boutique' },
    ...(features.loyalty.enabled
      ? [{ command: 'fidelite', description: 'Mes points de fidelite' }]
      : []),
    ...(features.referral.enabled
      ? [{ command: 'parrainage', description: 'Mon code de parrainage' }]
      : []),
  ];
  await bot.telegram.setMyCommands(base);
  for (const adminId of config.adminIds) {
    await bot.telegram.setMyCommands([...base, { command: 'admin', description: 'Tableau de bord admin' }], {
      scope: { type: 'chat', chat_id: adminId },
    });

    // Bouton "menu" de la conversation admin -> ouvre directement la Mini App.
    if (config.webAppUrl) {
      await bot.telegram.setChatMenuButton({
        chatId: adminId,
        menuButton: { type: 'web_app', text: 'Admin', web_app: { url: config.webAppUrl } },
      });
    }
  }
}

if (config.adminIds.length === 0) {
  console.warn('[config] ADMIN_IDS vide -> les commandes admin (/admin) sont inaccessibles.');
}

console.log('Demarrage du bot... (Ctrl+C pour arreter)');
bot.launch().catch((err) => {
  console.error('Impossible de demarrer le bot :', err);
  process.exit(1);
});

// Appels Telegram independants du long polling : lances tout de suite.
void publishCommands().catch((e) => console.error('[telegram] config commandes/menu :', e));

// Planificateur : tournees, purge sessions, alertes commandes en attente.
startScheduler(bot.telegram);

// Serveur HTTP : API admin + Mini App.
const httpServer = createServer(bot.telegram).listen(config.port, () => {
  console.log(`API + Mini App sur http://localhost:${config.port}`);
  if (!config.webAppUrl) {
    console.warn('[config] WEBAPP_URL vide -> pas de bouton Mini App (lance le tunnel puis renseigne .env).');
  }
});

function shutdown(signal: string): void {
  bot.stop(signal);
  httpServer.close();
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
