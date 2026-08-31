/**
 * Les "vues" du bot client : a partir des donnees (menu, panier), on produit un
 * couple { text, keyboard } pret a etre affiche. `render()` (index.ts) decide
 * d'editer le message existant ou d'en envoyer un neuf.
 *
 * Rendu : parse_mode HTML. Identite visuelle "carte / ticket de caisse" —
 * cartouche monospace en tete de la carte, descriptions en blockquote, panier
 * et recap en bloc <pre> aligne (echo du docket de la Mini App).
 *
 * REGLE : toute chaine dynamique (libelle produit, description, adresse...) passe
 * par esc() avant d'entrer dans le HTML. Un `<` non echappe casse tout le message.
 */
import { Markup } from 'telegraf';
import { CB } from './callbacks';
import { cartTotal, getCart, lineKey } from './cart';
import { getMenu } from './catalog';
import { features } from './features';
import { imagePath } from './uploads';

type InlineKeyboard = ReturnType<typeof Markup.inlineKeyboard>;

export interface View {
  text: string;
  keyboard: InlineKeyboard;
}

/** Vue avec photo : le detail d'un produit qui a une image. */
export interface PhotoView {
  photo: string; // chemin absolu du fichier
  caption: string;
  keyboard: InlineKeyboard;
}

export type AnyView = View | PhotoView;

export function isPhotoView(v: AnyView): v is PhotoView {
  return 'photo' in v;
}

// ---------------------------------------------------------------------------
// Helpers de rendu HTML
// ---------------------------------------------------------------------------

/** Echappe le HTML. A appeler sur TOUTE valeur dynamique. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Chemin de la banniere de la carte (envoyee sur /start). */
export const MENU_BANNER = 'assets/menu-banner.png';

/** En-tete de section : titre en gras. Le decor vient des blockquotes autour. */
export function section(title: string): string {
  return `<b>${esc(title)}</b>`;
}

// ---------------------------------------------------------------------------
// Bloc "ticket de caisse" <pre> : colonnes alignees, comme le docket Mini App
// ---------------------------------------------------------------------------

const RCP_W = 30;

function receiptRow(left: string, right: string): string {
  const max = RCP_W - right.length - 2;
  const l = left.length > max ? `${left.slice(0, Math.max(1, max - 1))}…` : left;
  const dots = Math.max(2, RCP_W - l.length - right.length - 2);
  return `${l} ${'.'.repeat(dots)} ${right}`;
}

export function receiptBlock(
  items: { label: string; qty: number; price: number }[],
  total: number,
  opts: { beforeTotal?: string[]; footer?: string[] } = {},
): string {
  const rule = '─'.repeat(RCP_W);
  const parts: string[] = items.map((l) =>
    receiptRow(`${l.label} ×${l.qty}`, `${l.price * l.qty} €`),
  );
  for (const s of opts.beforeTotal ?? []) {
    const m = s.match(/^(.*?)\s*:\s*(.+)$/);
    parts.push(m ? receiptRow(m[1]!, m[2]!) : s);
  }
  parts.push(rule, receiptRow('TOTAL', `${total} €`));
  if (opts.footer && opts.footer.length > 0) parts.push('', ...opts.footer);
  // esc() sur tout le bloc : les libelles produit peuvent contenir < > &.
  return `<pre>${esc(parts.join('\n'))}</pre>`;
}

// ---------------------------------------------------------------------------
// Vues
// ---------------------------------------------------------------------------

export const TAGLINE =
  features.fulfillment === 'pickup'
    ? 'Commande en ligne · retrait en boutique'
    : 'Commande en ligne · livraison & retrait';

/** Ecran d'accueil : identite + grille de categories. */
export function categoriesView(): View {
  const menu = getMenu();
  const catButtons = Object.entries(menu).map(([catId, cat]) =>
    Markup.button.callback(cat.label, CB.category(catId)),
  );

  const body =
    catButtons.length > 0
      ? 'Choisis une catégorie pour composer ta commande 👇'
      : 'La carte est momentanément vide — reviens un peu plus tard.';

  return {
    text: `<b>${esc(features.displayName)}</b>\n<i>${esc(TAGLINE)}</i>\n\n${body}`,
    keyboard: Markup.inlineKeyboard([
      ...chunk(catButtons, 2),
      [Markup.button.callback('🛒 Mon panier', CB.showCart())],
    ]),
  };
}

/** Ecran d'une categorie : produits listes (desc en blockquote) + grille. */
export function categoryView(catId: string): View | null {
  const cat = getMenu()[catId];
  if (!cat) return null;
  const entries = Object.entries(cat.items);

  const list = entries
    .map(([, item]) => {
      const price = `${item.variants.length > 0 ? 'dès ' : ''}${item.price} €`;
      const desc = item.description ? `\n<i>${esc(item.description)}</i>` : '';
      return `<b>${esc(item.label)}</b>  ·  ${price}${desc}`;
    })
    .join('\n\n');

  const buttons = entries.map(([prodId, item]) =>
    Markup.button.callback(item.label, CB.product(catId, prodId)),
  );

  return {
    text: `${section(cat.label)}\n\n${list}`,
    keyboard: Markup.inlineKeyboard([
      ...chunk(buttons, 2),
      [Markup.button.callback('⬅️ Retour à la carte', CB.home())],
    ]),
  };
}

/** Ecran d'un produit : detail + ajout au panier (ou choix de la variante). */
export function productView(catId: string, prodId: string): AnyView | null {
  const item = getMenu()[catId]?.items[prodId];
  if (!item) return null;

  const back = Markup.button.callback('⬅️ Retour', CB.category(catId));
  const hasVariants = item.variants.length > 0;

  const rows = hasVariants
    ? [
        ...chunk(
          item.variants.map((v) =>
            Markup.button.callback(`${v.label} · ${v.price} €`, CB.addVariant(catId, prodId, v.id)),
          ),
          2,
        ),
        [back],
      ]
    : [[Markup.button.callback('➕ Ajouter au panier', CB.addToCart(catId, prodId))], [back]];
  const keyboard = Markup.inlineKeyboard(rows);

  const priceLine = hasVariants
    ? `Choisis ${esc(features.variants.label.toLowerCase())} — à partir de <b>${item.price} €</b>`
    : `Prix : <b>${item.price} €</b>`;

  if (item.image) {
    // Caption : pas de blockquote (support limite), description en italique.
    const desc = item.description ? `<i>${esc(item.description)}</i>\n\n` : '';
    return {
      photo: imagePath(item.image),
      caption: `<b>${esc(item.label)}</b>\n\n${desc}${priceLine}`,
      keyboard,
    };
  }

  const parts = [`<b>${esc(item.label)}</b>`];
  if (item.description) parts.push(`<i>${esc(item.description)}</i>`);
  parts.push(priceLine);
  return { text: parts.join('\n\n'), keyboard };
}

/** Ecran du panier : ticket <pre> + boutons ligne par ligne. */
export function cartView(userId: number): View {
  const lines = getCart(userId);

  if (lines.length === 0) {
    return {
      text:
        `${section('Ton panier')}\n\n` +
        "Il est vide pour l'instant.\nParcours la carte pour ajouter des articles.",
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Retour à la carte', CB.home())],
      ]),
    };
  }

  const lineRows = lines.map((l) => {
    const key = lineKey(l.catId, l.prodId, l.variantId);
    return [
      Markup.button.callback('➖', CB.lineDec(key)),
      Markup.button.callback(`${l.label} ×${l.qty}`, 'noop'),
      Markup.button.callback('➕', CB.lineInc(key)),
      Markup.button.callback('🗑', CB.lineDel(key)),
    ];
  });

  return {
    text: `${section('Ton panier')}\n\n${receiptBlock(lines, cartTotal(userId))}`,
    keyboard: Markup.inlineKeyboard([
      ...lineRows,
      [Markup.button.callback('✅ Valider la commande', CB.startCheckout())],
      [
        Markup.button.callback('🗑 Vider', CB.clearCart()),
        Markup.button.callback('⬅️ La carte', CB.home()),
      ],
    ]),
  };
}
