/**
 * Scene "checkout" (WizardScene = scene lineaire a etapes).
 *
 *   Etape 1  adresse de livraison
 *   Etape 2  telephone
 *   Etape 3  creneau de livraison (issu des modeles de tournees)
 *   Etape 4  precision de livraison (etage, code) - optionnelle
 *   Etape 5  recapitulatif + confirmation
 *
 * Adresse / numero / precision de la derniere commande proposes en un clic.
 *
 * A la confirmation : on reconcilie le panier avec le menu courant (produit devenu
 * indisponible / prix change), puis le panier devient une ligne dans `orders`,
 * la fiche client est rafraichie, et le panier est vide.
 */
import { Composer, Markup, Scenes } from 'telegraf';
import { message } from 'telegraf/filters';
import { cartTotal, clearCart, getCart, reconcileCart } from '../cart';
import { notifyNewOrder } from '../orderFlow';
import { userId, type BotContext, type CheckoutState } from '../context';
import { getCustomer, upsertCustomer } from '../customers';
import { createOrder, getLastOrder, getOrder } from '../orders';
import { getAvailableSlots, type Slot } from '../routes';

export const CHECKOUT_SCENE_ID = 'checkout';

// Validation volontairement permissive : chiffres, espaces, + ( ) . -
const PHONE_RE = /^\+?[\d\s().-]{6,20}$/;

function slotButtonLabel(s: Slot): string {
  return `🕒 ${s.time} ${s.when === 'today' ? "aujourd'hui" : 'demain'}`;
}

function state(ctx: BotContext): CheckoutState {
  return ctx.wizard.state as CheckoutState;
}

function shorten(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

/** Retire les boutons du message d'ou vient le clic (feedback visuel). */
async function stripButtons(ctx: BotContext): Promise<void> {
  try {
    await ctx.editMessageReplyMarkup(undefined);
  } catch {
    /* message deja modifie / trop vieux : sans importance */
  }
}

// ---------------------------------------------------------------------------
// Etape 1 : adresse
// ---------------------------------------------------------------------------

/** Jouee des l'entree dans la scene. */
async function askAddress(ctx: BotContext): Promise<void> {
  const uid = userId(ctx);
  if (getCart(uid).length === 0) {
    await ctx.reply('Ton panier est vide. Ajoute des produits avec /start.');
    await ctx.scene.leave();
    return;
  }

  const last = getLastOrder(uid);
  if (last) {
    state(ctx).lastAddress = last.address;
    state(ctx).lastPhone = last.phone;
  }
  const note = getCustomer(uid)?.delivery_note;
  if (note) state(ctx).lastNote = note;

  await ctx.reply(
    'Etape 1/5 - Adresse de livraison\n\n' +
      (last
        ? 'Reutilise ta derniere adresse (bouton) ou tape une nouvelle adresse.'
        : 'Indique ton adresse complete (rue, numero, ville).') +
      '\n(/annuler pour abandonner)',
    last
      ? Markup.inlineKeyboard([
          [Markup.button.callback(`📍 ${shorten(last.address, 45)}`, 'co:addr')],
        ])
      : undefined,
  );
  ctx.wizard.next();
}

const collectAddress = new Composer<BotContext>();

collectAddress.action('co:addr', async (ctx) => {
  const last = state(ctx).lastAddress;
  if (!last) {
    await ctx.answerCbQuery('Aucune adresse memorisee');
    return;
  }
  await ctx.answerCbQuery('Adresse reutilisee');
  await stripButtons(ctx);
  state(ctx).address = last;
  await promptPhone(ctx);
  ctx.wizard.next();
});

collectAddress.on(message('text'), async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.length < 5) {
    await ctx.reply('Adresse trop courte. Precise rue, numero et ville.');
    return;
  }
  state(ctx).address = text;
  await promptPhone(ctx);
  ctx.wizard.next();
});

collectAddress.on('message', async (ctx) => {
  await ctx.reply('Tape ton adresse en toutes lettres, ou utilise le bouton.');
});

// ---------------------------------------------------------------------------
// Etape 2 : telephone
// ---------------------------------------------------------------------------

async function promptPhone(ctx: BotContext): Promise<void> {
  const last = state(ctx).lastPhone;
  await ctx.reply(
    'Etape 2/5 - Telephone\n\n' +
      (last
        ? 'Reutilise ton dernier numero (bouton) ou tape-en un nouveau.'
        : 'Indique ton numero de telephone (ex : 06 12 34 56 78).') +
      '\nIl permet de te joindre pour la livraison.',
    last ? Markup.inlineKeyboard([[Markup.button.callback(`📞 ${last}`, 'co:phone')]]) : undefined,
  );
}

const collectPhone = new Composer<BotContext>();

collectPhone.action('co:phone', async (ctx) => {
  const last = state(ctx).lastPhone;
  if (!last) {
    await ctx.answerCbQuery('Aucun numero memorise');
    return;
  }
  await ctx.answerCbQuery('Numero reutilise');
  await stripButtons(ctx);
  state(ctx).phone = last;
  await promptSlot(ctx);
  ctx.wizard.next();
});

collectPhone.on(message('text'), async (ctx) => {
  const phone = ctx.message.text.trim();
  if (!PHONE_RE.test(phone)) {
    await ctx.reply('Numero invalide. Indique un numero valide (ex : 06 12 34 56 78).');
    return;
  }
  state(ctx).phone = phone;
  await promptSlot(ctx);
  ctx.wizard.next();
});

collectPhone.on('message', async (ctx) => {
  await ctx.reply('Tape un numero de telephone, ou utilise le bouton.');
});

// ---------------------------------------------------------------------------
// Etape 3 : creneau de livraison
// ---------------------------------------------------------------------------

async function promptSlot(ctx: BotContext): Promise<void> {
  const slots = getAvailableSlots();
  const rows = slots.map((s) => [Markup.button.callback(slotButtonLabel(s), `slot:${s.routeId}`)]);
  rows.push([Markup.button.callback('Peu importe (au plus tot)', 'slot:any')]);

  await ctx.reply(
    'Etape 3/5 - Creneau de livraison\n\n' +
      (slots.length > 0
        ? 'Choisis quand tu veux etre livre :'
        : 'Aucun creneau programme pour le moment. On te livrera au plus tot.'),
    Markup.inlineKeyboard(rows),
  );
}

const collectSlot = new Composer<BotContext>();

collectSlot.action(/^slot:(any|\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await stripButtons(ctx);

  const raw = ctx.match?.[1] ?? 'any';
  const s = state(ctx);

  if (raw === 'any') {
    s.routeId = null;
    s.slotLabel = undefined;
  } else {
    const chosen = getAvailableSlots().find((x) => x.routeId === Number(raw));
    if (!chosen) {
      await ctx.reply("Ce creneau n'est plus disponible, choisis-en un autre.");
      await promptSlot(ctx);
      return; // on reste sur l'etape
    }
    s.routeId = chosen.routeId;
    s.slotLabel = `${chosen.time} ${chosen.when === 'today' ? "aujourd'hui" : 'demain'}`;
  }

  await promptNote(ctx);
  ctx.wizard.next();
});

collectSlot.on('message', async (ctx) => {
  await ctx.reply('Choisis un creneau avec les boutons ci-dessus.');
});

// ---------------------------------------------------------------------------
// Etape 4 : precision de livraison (optionnelle)
// ---------------------------------------------------------------------------

async function promptNote(ctx: BotContext): Promise<void> {
  const last = state(ctx).lastNote;
  const rows = [[Markup.button.callback('Aucune precision', 'co:nonote')]];
  if (last) rows.unshift([Markup.button.callback(`📝 ${shorten(last, 40)}`, 'co:note')]);

  await ctx.reply(
    'Etape 4/5 - Precision pour la livraison\n\n' +
      'Etage, code d\'acces, batiment... Tape ta precision ou choisis ci-dessous.',
    Markup.inlineKeyboard(rows),
  );
}

const collectNote = new Composer<BotContext>();

collectNote.action('co:note', async (ctx) => {
  await ctx.answerCbQuery('Precision reutilisee');
  await stripButtons(ctx);
  state(ctx).deliveryNote = state(ctx).lastNote;
  await promptConfirm(ctx);
  ctx.wizard.next();
});

collectNote.action('co:nonote', async (ctx) => {
  await ctx.answerCbQuery();
  await stripButtons(ctx);
  state(ctx).deliveryNote = undefined;
  await promptConfirm(ctx);
  ctx.wizard.next();
});

collectNote.on(message('text'), async (ctx) => {
  const text = ctx.message.text.trim();
  state(ctx).deliveryNote = text.length > 0 ? text.slice(0, 200) : undefined;
  await promptConfirm(ctx);
  ctx.wizard.next();
});

collectNote.on('message', async (ctx) => {
  await ctx.reply('Tape ta precision, ou utilise les boutons.');
});

// ---------------------------------------------------------------------------
// Etape 5 : recapitulatif + confirmation
// ---------------------------------------------------------------------------

async function promptConfirm(ctx: BotContext): Promise<void> {
  const uid = userId(ctx);
  const lines = getCart(uid);
  const s = state(ctx);
  const body = lines.map((l) => `- ${l.label} x ${l.qty}  =  ${l.price * l.qty} EUR`).join('\n');

  await ctx.reply(
    'Etape 5/5 - Confirmation\n\n' +
      `${body}\n\n` +
      `Total : ${cartTotal(uid)} EUR\n` +
      `Adresse : ${s.address}\n` +
      `Telephone : ${s.phone}\n` +
      `Creneau : ${s.slotLabel ?? 'au plus tot'}\n` +
      (s.deliveryNote ? `Precision : ${s.deliveryNote}\n` : '') +
      'Paiement : a la livraison (especes / carte sur place)\n\n' +
      'On valide la commande ?',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Confirmer', 'order:confirm')],
      [Markup.button.callback('❌ Annuler', 'order:cancel')],
    ]),
  );
}

const confirmStep = new Composer<BotContext>();

confirmStep.action('order:confirm', async (ctx) => {
  await ctx.answerCbQuery();

  const uid = userId(ctx);
  const { address, phone, routeId, slotLabel, deliveryNote } = state(ctx);

  // Un produit / une taille a pu devenir indisponible, ou un prix changer.
  const { removed, repriced } = reconcileCart(uid);
  if (removed.length > 0) {
    const names = removed.map((l) => `« ${l.label} »`).join(', ');
    await ctx.reply(`⚠️ ${names} n'est plus disponible et a ete retire de ton panier.`);
  }
  if (repriced.length > 0) {
    await ctx.reply('ℹ️ Certains prix ont ete mis a jour, verifie le total.');
  }

  const lines = getCart(uid);
  if (lines.length === 0 || !address || !phone) {
    await ctx.editMessageText(
      removed.length > 0
        ? 'Ton panier est vide apres retrait des produits indisponibles. /start pour recommencer.'
        : 'Commande impossible (panier vide ou infos manquantes). /start pour recommencer.',
    );
    await ctx.scene.leave();
    return;
  }

  // Prix / produits ont bouge -> on renvoie vers le recap plutot que de valider a l'aveugle.
  if (removed.length > 0 || repriced.length > 0) {
    await promptConfirm(ctx);
    return; // on reste sur l'etape confirmation
  }

  const orderId = createOrder({
    userId: uid,
    username: ctx.from?.username,
    phone,
    address,
    items: lines,
    total: cartTotal(uid),
    routeId: routeId ?? null,
    deliveryNote: deliveryNote ?? null,
  });
  // Fiche client : creee ou rafraichie (username / tel / adresse / precision).
  upsertCustomer({ userId: uid, username: ctx.from?.username, phone, address, deliveryNote });
  clearCart(uid);

  await ctx.editMessageText(
    `✅ Commande #${orderId} enregistree !\n\n` +
      'Statut : en attente de confirmation\n' +
      `Creneau : ${slotLabel ?? 'au plus tot'}\n\n` +
      'Tu recevras un message des que la commande est confirmee.',
  );
  await ctx.scene.leave();

  // Le bot previent l'admin (sens client -> admin).
  const created = getOrder(orderId);
  if (created) await notifyNewOrder(ctx.telegram, created);
});

confirmStep.action('order:cancel', async (ctx) => {
  await ctx.answerCbQuery('Commande annulee');
  await ctx.editMessageText('Commande annulee. Ton panier est conserve.');
  await ctx.scene.leave();
});

confirmStep.on('message', async (ctx) => {
  await ctx.reply('Utilise les boutons "Confirmer" ou "Annuler" ci-dessus.');
});

// ---------------------------------------------------------------------------

export const checkoutScene = new Scenes.WizardScene<BotContext>(
  CHECKOUT_SCENE_ID,
  askAddress,
  collectAddress,
  collectPhone,
  collectSlot,
  collectNote,
  confirmStep,
);

// /annuler disponible a n'importe quelle etape de la scene.
checkoutScene.command('annuler', async (ctx) => {
  await ctx.reply('Commande abandonnee. Ton panier est conserve.');
  await ctx.scene.leave();
});
