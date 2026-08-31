/**
 * Scene "checkout" (WizardScene = scene lineaire a etapes).
 *
 * Les etapes REELLEMENT jouees dependent de `src/features.ts` :
 *
 *   adresse      si features.requiresAddress
 *   telephone    si features.requiresPhone
 *   creneau      si features.deliverySlots.enabled
 *   precision    si features.deliveryNote.enabled
 *   recapitulatif + confirmation   (toujours)
 *
 * Le chainage est imperatif : chaque `goToX` joue son etape ou la saute en
 * appelant directement la suivante. Le numero "Etape X/N" est calcule a partir
 * de `FLOW` (liste des etapes actives pour cette configuration).
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
import { loyaltyStatus } from '../modules/loyalty';
import {
  commitCheckout as commitReferral,
  previewCheckout as previewReferral,
} from '../modules/referral';
import { initialStatusId, statusLabel } from '../orderStages';
import { userId, type BotContext, type CheckoutState } from '../context';
import { getCustomer, upsertCustomer } from '../customers';
import { createOrder, getLastOrder, getOrder } from '../orders';
import { getAvailableSlots, hasUpcomingSlots, type Slot } from '../routes';
import { features } from '../features';
import { esc, receiptBlock } from '../views';

export const CHECKOUT_SCENE_ID = 'checkout';

// Validation volontairement permissive : chiffres, espaces, + ( ) . -
const PHONE_RE = /^\+?[\d\s().-]{6,20}$/;

// Index des handlers dans la WizardScene (cf. `checkoutScene` en bas de fichier).
const STEP = {
  collectAddress: 1,
  collectPhone: 2,
  collectSlot: 3,
  collectNote: 4,
  confirm: 5,
} as const;

// Etapes actives pour cette configuration client -> numerotation affichee.
const FLOW: string[] = [
  ...(features.requiresAddress ? ['address'] : []),
  ...(features.requiresPhone ? ['phone'] : []),
  ...(features.deliverySlots.enabled ? ['slot'] : []),
  ...(features.deliveryNote.enabled ? ['note'] : []),
  'confirm',
];

/** En-tete d'etape (HTML). `title` est toujours une constante -> pas d'esc. */
function stepHeader(key: string, title: string): string {
  const n = FLOW.indexOf(key) + 1;
  return `<i>Étape ${n}/${FLOW.length}</i>  ·  <b>${title}</b>`;
}

function slotButtonLabel(s: Slot): string {
  const when = s.when === 'today' ? "aujourd'hui" : 'demain';
  // On ne montre le compteur que quand il commence a se remplir (evite le bruit).
  const left =
    s.remaining !== null && s.remaining <= 3
      ? ` — ${s.remaining} place${s.remaining > 1 ? 's' : ''}`
      : '';
  return `🕒 ${s.time} ${when}${left}`;
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
// Enchainement : chaque `goToX` joue l'etape X ou la saute (config-dependant).
// ---------------------------------------------------------------------------

async function goToPhone(ctx: BotContext): Promise<void> {
  if (!features.requiresPhone) {
    state(ctx).phone = undefined;
    await goToSlot(ctx);
    return;
  }
  await promptPhone(ctx);
  ctx.wizard.selectStep(STEP.collectPhone);
}

async function goToSlot(ctx: BotContext): Promise<void> {
  if (!features.deliverySlots.enabled) {
    state(ctx).routeId = null;
    state(ctx).slotLabel = undefined;
    await goToNote(ctx);
    return;
  }
  await promptSlot(ctx);
  ctx.wizard.selectStep(STEP.collectSlot);
}

async function goToNote(ctx: BotContext): Promise<void> {
  if (!features.deliveryNote.enabled) {
    state(ctx).deliveryNote = undefined;
    await goToConfirm(ctx);
    return;
  }
  await promptNote(ctx);
  ctx.wizard.selectStep(STEP.collectNote);
}

async function goToConfirm(ctx: BotContext): Promise<void> {
  await promptConfirm(ctx);
  ctx.wizard.selectStep(STEP.confirm);
}

// ---------------------------------------------------------------------------
// Etape 1 : adresse
// ---------------------------------------------------------------------------

/** Jouee des l'entree dans la scene. */
async function askAddress(ctx: BotContext): Promise<void> {
  const uid = userId(ctx);
  if (getCart(uid).length === 0) {
    await ctx.reply('Ton panier est vide. Tape /start pour parcourir le menu.');
    await ctx.scene.leave();
    return;
  }

  const last = getLastOrder(uid);
  const lastAddress = last?.address ?? undefined;
  const lastPhone = last?.phone ?? undefined;
  if (lastAddress) state(ctx).lastAddress = lastAddress;
  if (lastPhone) state(ctx).lastPhone = lastPhone;
  const note = getCustomer(uid)?.delivery_note;
  if (note) state(ctx).lastNote = note;

  if (!features.requiresAddress) {
    state(ctx).address = undefined;
    await goToPhone(ctx);
    return;
  }

  // Client connu : on propose de tout reprendre en un tap (adresse + numero, et
  // le numero seul saute directement l'etape telephone).
  const reuseRows = [
    ...(lastAddress && lastPhone && features.requiresPhone
      ? [[Markup.button.callback('⚡ Mêmes adresse et numéro', 'co:reuse')]]
      : []),
    ...(lastAddress
      ? [[Markup.button.callback(`📍 ${shorten(lastAddress, 40)}`, 'co:addr')]]
      : []),
  ];

  await ctx.reply(
    `${stepHeader('address', 'Adresse de livraison')}\n\n` +
      (lastAddress
        ? 'Reprends ta dernière adresse ci-dessous, ou tape la nouvelle.'
        : 'Indique ton adresse complète (rue, numéro, ville).') +
      '\n\n<i>/annuler pour abandonner.</i>',
    reuseRows.length > 0
      ? { parse_mode: 'HTML', ...Markup.inlineKeyboard(reuseRows) }
      : { parse_mode: 'HTML' },
  );
  ctx.wizard.selectStep(STEP.collectAddress);
}

const collectAddress = new Composer<BotContext>();

collectAddress.action('co:reuse', async (ctx) => {
  const s = state(ctx);
  if (!s.lastAddress || !s.lastPhone) {
    await ctx.answerCbQuery('Infos indisponibles, saisis-les');
    return;
  }
  await ctx.answerCbQuery('Adresse et numéro repris');
  await stripButtons(ctx);
  s.address = s.lastAddress;
  s.phone = s.lastPhone;
  await goToSlot(ctx); // saute l'etape telephone
});

collectAddress.action('co:addr', async (ctx) => {
  const last = state(ctx).lastAddress;
  if (!last) {
    await ctx.answerCbQuery('Aucune adresse mémorisée');
    return;
  }
  await ctx.answerCbQuery('Adresse reprise');
  await stripButtons(ctx);
  state(ctx).address = last;
  await goToPhone(ctx);
});

collectAddress.on(message('text'), async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.length < 5) {
    await ctx.reply('Adresse trop courte — précise la rue, le numéro et la ville.');
    return;
  }
  state(ctx).address = text;
  await goToPhone(ctx);
});

collectAddress.on('message', async (ctx) => {
  await ctx.reply('Tape ton adresse en toutes lettres, ou utilise un bouton.');
});

// ---------------------------------------------------------------------------
// Etape 2 : telephone
// ---------------------------------------------------------------------------

async function promptPhone(ctx: BotContext): Promise<void> {
  const last = state(ctx).lastPhone;
  await ctx.reply(
    `${stepHeader('phone', 'Téléphone')}\n\n` +
      (last
        ? 'Reprends ton dernier numéro ci-dessous, ou tape le nouveau.'
        : 'Ton numéro de téléphone (ex : 06 12 34 56 78) — il sert à te joindre pour la livraison.'),
    {
      parse_mode: 'HTML',
      ...(last
        ? Markup.inlineKeyboard([[Markup.button.callback(`📞 ${last}`, 'co:phone')]])
        : {}),
    },
  );
}

const collectPhone = new Composer<BotContext>();

collectPhone.action('co:phone', async (ctx) => {
  const last = state(ctx).lastPhone;
  if (!last) {
    await ctx.answerCbQuery('Aucun numero memorise');
    return;
  }
  await ctx.answerCbQuery('Numéro repris');
  await stripButtons(ctx);
  state(ctx).phone = last;
  await goToSlot(ctx);
});

collectPhone.on(message('text'), async (ctx) => {
  const phone = ctx.message.text.trim();
  if (!PHONE_RE.test(phone)) {
    await ctx.reply('Numéro non reconnu — indique-le sous la forme 06 12 34 56 78.');
    return;
  }
  state(ctx).phone = phone;
  await goToSlot(ctx);
});

collectPhone.on('message', async (ctx) => {
  await ctx.reply('Tape ton numéro de téléphone, ou utilise le bouton.');
});

// ---------------------------------------------------------------------------
// Etape 3 : creneau de livraison
// ---------------------------------------------------------------------------

async function promptSlot(ctx: BotContext): Promise<void> {
  const slots = getAvailableSlots();
  const rows = slots.map((s) => [Markup.button.callback(slotButtonLabel(s), `slot:${s.routeId}`)]);
  rows.push([Markup.button.callback('Peu importe — au plus tôt', 'slot:any')]);

  const intro =
    slots.length > 0
      ? 'Choisis ton créneau de livraison :'
      : hasUpcomingSlots()
        ? 'Tous les créneaux sont complets pour le moment — on te livrera au plus tôt.'
        : 'Aucun créneau programmé pour le moment — on te livrera au plus tôt.';

  await ctx.reply(`${stepHeader('slot', 'Créneau de livraison')}\n\n${intro}`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(rows),
  });
}

const collectSlot = new Composer<BotContext>();

collectSlot.action(/^slot:(any|\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('Créneau choisi');
  await stripButtons(ctx);

  const raw = ctx.match?.[1] ?? 'any';
  const s = state(ctx);

  if (raw === 'any') {
    s.routeId = null;
    s.slotLabel = undefined;
  } else {
    const chosen = getAvailableSlots().find((x) => x.routeId === Number(raw));
    if (!chosen) {
      await ctx.reply('Ce créneau vient de se remplir — choisis-en un autre :');
      await promptSlot(ctx);
      return; // on reste sur l'etape
    }
    s.routeId = chosen.routeId;
    s.slotLabel = `${chosen.time} ${chosen.when === 'today' ? "aujourd'hui" : 'demain'}`;
  }

  await goToNote(ctx);
});

collectSlot.on('message', async (ctx) => {
  await ctx.reply('Choisis un créneau avec les boutons ci-dessus.');
});

// ---------------------------------------------------------------------------
// Etape 4 : precision de livraison (optionnelle)
// ---------------------------------------------------------------------------

async function promptNote(ctx: BotContext): Promise<void> {
  const last = state(ctx).lastNote;
  const rows = [[Markup.button.callback('Aucune précision', 'co:nonote')]];
  if (last) rows.unshift([Markup.button.callback(`📝 ${shorten(last, 40)}`, 'co:note')]);

  await ctx.reply(
    `${stepHeader('note', 'Précision de livraison')}\n\n` +
      `<i>${esc(features.deliveryNote.label)}</i>\n\nTape ta précision, ou :`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) },
  );
}

const collectNote = new Composer<BotContext>();

collectNote.action('co:note', async (ctx) => {
  await ctx.answerCbQuery('Precision reutilisee');
  await stripButtons(ctx);
  state(ctx).deliveryNote = state(ctx).lastNote;
  await goToConfirm(ctx);
});

collectNote.action('co:nonote', async (ctx) => {
  await ctx.answerCbQuery();
  await stripButtons(ctx);
  state(ctx).deliveryNote = undefined;
  await goToConfirm(ctx);
});

collectNote.on(message('text'), async (ctx) => {
  const text = ctx.message.text.trim();
  state(ctx).deliveryNote = text.length > 0 ? text.slice(0, 200) : undefined;
  await goToConfirm(ctx);
});

collectNote.on('message', async (ctx) => {
  await ctx.reply('Tape ta précision, ou utilise les boutons.');
});

// ---------------------------------------------------------------------------
// Etape 5 : recapitulatif + confirmation
// ---------------------------------------------------------------------------

/** Ligne "Paiement" du recap, derivee de la config. */
function paymentLine(): string {
  const quand = features.fulfillment === 'pickup' ? 'au retrait' : 'à la livraison';
  const methods = features.payment.methods
    .map((m) => (m === 'cash' ? 'espèces' : 'carte'))
    .join(' ou ');
  return `💳 Paiement ${quand} (${methods})`;
}

/** Ligne "récompense fidélité disponible" du recap (HTML), si le client en a une. */
function loyaltyLine(uid: number): string {
  if (!features.loyalty.enabled) return '';
  const s = loyaltyStatus(uid);
  return s.rewardsAvailable > 0
    ? `🎁 Récompense fidélité à utiliser : <b>${esc(s.rewardLabel)}</b> — signale-le au livreur.`
    : '';
}

/**
 * Recap sous forme de ticket monospace (<pre>), en echo du docket de la Mini App.
 * Tout ce qui est variable (adresse en texte libre incluse) vit DANS le bloc <pre>
 * (echappe par receiptBlock) -> impossible de casser le HTML du message.
 */
async function promptConfirm(ctx: BotContext): Promise<void> {
  const uid = userId(ctx);
  const lines = getCart(uid);
  const s = state(ctx);

  const subtotal = cartTotal(uid);
  const ref = features.referral.enabled ? previewReferral(uid, subtotal) : null;
  const total = subtotal - (ref?.discount ?? 0);

  const footer = [
    ...(s.address ? [`📍 ${s.address}`] : []),
    ...(s.phone ? [`📞 ${s.phone}`] : []),
    ...(features.deliverySlots.enabled ? [`🕒 ${s.slotLabel ?? 'au plus tôt'}`] : []),
    ...(s.deliveryNote ? [`📝 ${s.deliveryNote}`] : []),
    paymentLine(),
  ];
  const loyalty = loyaltyLine(uid).trim();

  await ctx.reply(
    `${stepHeader('confirm', 'Récapitulatif')}\n\n` +
      receiptBlock(lines, total, { beforeTotal: ref?.lines ?? [], footer }) +
      '\n\n' +
      (loyalty ? `${loyalty}\n\n` : '') +
      'On valide ?',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmer la commande', 'order:confirm')],
        [Markup.button.callback('❌ Annuler', 'order:cancel')],
      ]),
    },
  );
}

const confirmStep = new Composer<BotContext>();

confirmStep.action('order:confirm', async (ctx) => {
  await ctx.answerCbQuery('Commande envoyée !');

  const uid = userId(ctx);
  const { address, phone, routeId, slotLabel, deliveryNote } = state(ctx);

  // Un produit / une taille a pu devenir indisponible, ou un prix changer.
  const { removed, repriced } = reconcileCart(uid);
  if (removed.length > 0) {
    const names = removed.map((l) => `« ${l.label} »`).join(', ');
    await ctx.reply(`⚠️ ${names} n'est plus disponible — on l'a retiré de ton panier.`);
  }
  if (repriced.length > 0) {
    await ctx.reply('ℹ️ Certains prix ont changé — vérifie le total avant de valider.');
  }

  const lines = getCart(uid);
  const missingInfo =
    (features.requiresAddress && !address) || (features.requiresPhone && !phone);
  if (lines.length === 0 || missingInfo) {
    await ctx.editMessageText(
      removed.length > 0
        ? 'Ton panier est vide après le retrait des produits indisponibles. Tape /start pour recommencer.'
        : 'Commande impossible (panier vide ou infos manquantes). Tape /start pour recommencer.',
    );
    await ctx.scene.leave();
    return;
  }

  // Prix / produits ont bouge -> on renvoie vers le recap plutot que de valider a l'aveugle.
  if (removed.length > 0 || repriced.length > 0) {
    await promptConfirm(ctx);
    return; // on reste sur l'etape confirmation
  }

  const subtotal = cartTotal(uid);
  const ref = features.referral.enabled ? previewReferral(uid, subtotal) : null;
  const total = subtotal - (ref?.discount ?? 0);

  const orderId = createOrder({
    userId: uid,
    username: ctx.from?.username,
    phone,
    address,
    items: lines,
    total,
    routeId: routeId ?? null,
    deliveryNote: deliveryNote ?? null,
    referralDiscount: ref && ref.discount > 0 ? ref.discount : null,
  });
  // Fiche client : creee ou rafraichie (username / tel / adresse / precision).
  upsertCustomer({ userId: uid, username: ctx.from?.username, phone, address, deliveryNote });
  clearCart(uid);

  // Applique le parrainage en base + notifie le parrain si son filleul vient de commander.
  if (ref && ref.discount > 0) {
    const { parrainToNotify } = commitReferral(ref);
    if (parrainToNotify !== null) {
      await ctx.telegram
        .sendMessage(
          parrainToNotify,
          `🎁 Ton filleul vient de passer sa première commande ! ${features.referral.parrainReward} € pour toi sur ta prochaine commande.`,
        )
        .catch(() => undefined);
    }
  }

  const recapLines = [
    `Statut : ${statusLabel(initialStatusId())}`,
    ...(ref && ref.discount > 0
      ? [`Réduction parrainage : −${ref.discount} € (payé ${total} €)`]
      : []),
    ...(features.deliverySlots.enabled ? [`Créneau : ${slotLabel ?? 'au plus tôt'}`] : []),
  ];
  await ctx.editMessageText(
    `<b>✓ Commande #${orderId} enregistrée</b>\n\n` +
      `${esc(recapLines.join('\n'))}\n\n` +
      "On te prévient dès qu'elle est confirmée. Merci ! 🙏",
    { parse_mode: 'HTML' },
  );
  await ctx.scene.leave();

  // Le bot previent l'admin (sens client -> admin).
  const created = getOrder(orderId);
  if (created) await notifyNewOrder(ctx.telegram, created);
});

confirmStep.action('order:cancel', async (ctx) => {
  await ctx.answerCbQuery('Commande abandonnée');
  await ctx.editMessageText('Commande abandonnée. Ton panier est conservé.');
  await ctx.scene.leave();
});

confirmStep.on('message', async (ctx) => {
  await ctx.reply('Utilise les boutons « Confirmer » ou « Annuler » ci-dessus.');
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
  await ctx.reply('Commande abandonnée. Ton panier est conservé.');
  await ctx.scene.leave();
});
