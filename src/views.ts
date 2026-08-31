/**
 * Les "vues" : a partir des donnees (menu, panier), on produit un couple
 * { text, keyboard } pret a etre affiche.
 *
 * Aucune vue n'envoie de message elle-meme : c'est le role de `render()` dans
 * index.ts de decider s'il faut editer le message existant ou en envoyer un neuf.
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

/**
 * Bloc « ticket de caisse » monospace (```) : colonnes alignees, comme le
 * docket de la Mini App. A l'interieur d'un bloc code, Telegram n'interprete
 * aucun Markdown -> les libelles produit y sont sans danger.
 */
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
  return `\`\`\`\n${parts.join('\n')}\n\`\`\``;
}

/** Ecran d'accueil : la liste des categories. */
export function categoriesView(): View {
  const menu = getMenu();
  const rows = Object.entries(menu).map(([catId, cat]) => [
    Markup.button.callback(cat.label, CB.category(catId)),
  ]);
  rows.push([Markup.button.callback('🛒 Voir mon panier', CB.showCart())]);

  return {
    text: `*${features.displayName}*\n\nNotre menu du jour — choisis une catégorie :`,
    keyboard: Markup.inlineKeyboard(rows),
  };
}

/** Ecran d'une categorie : la liste de ses produits. */
export function categoryView(catId: string): View | null {
  const cat = getMenu()[catId];
  if (!cat) return null;

  const rows = Object.entries(cat.items).map(([prodId, item]) => [
    Markup.button.callback(
      `${item.label} — ${item.variants.length > 0 ? 'dès ' : ''}${item.price} €`,
      CB.product(catId, prodId),
    ),
  ]);
  rows.push([Markup.button.callback('⬅️ Retour aux catégories', CB.home())]);

  return {
    text: `*${cat.label}*`,
    keyboard: Markup.inlineKeyboard(rows),
  };
}

/** Ecran d'un produit : detail + ajout au panier (ou choix de la taille). */
export function productView(catId: string, prodId: string): AnyView | null {
  const item = getMenu()[catId]?.items[prodId];
  if (!item) return null;

  const rows =
    item.variants.length > 0
      ? item.variants.map((v) => [
          Markup.button.callback(`${v.label} — ${v.price} €`, CB.addVariant(catId, prodId, v.id)),
        ])
      : [[Markup.button.callback('➕ Ajouter au panier', CB.addToCart(catId, prodId))]];
  rows.push([Markup.button.callback('⬅️ Retour', CB.category(catId))]);
  const keyboard = Markup.inlineKeyboard(rows);

  const priceLine =
    item.variants.length > 0
      ? `Choisis : _${features.variants.label.toLowerCase()}_ (à partir de *${item.price} €*)`
      : `*${item.price} €*`;
  const desc = item.description ? `${item.description}\n\n` : '\n';
  const text = `*${item.label}*\n${desc}${priceLine}`;

  if (item.image) {
    return { photo: imagePath(item.image), caption: text, keyboard };
  }
  return { text, keyboard };
}

/** Ecran du panier : recapitulatif + total + vider. */
export function cartView(userId: number): View {
  const lines = getCart(userId);

  if (lines.length === 0) {
    return {
      text: '🛒 *Ton panier est vide.*\n\nParcours le menu pour ajouter des articles.',
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Retour au menu', CB.home())],
      ]),
    };
  }

  // Une ligne de boutons par article : ➖  "label x qty"  ➕  🗑
  const lineRows = lines.map((l) => {
    const key = lineKey(l.catId, l.prodId, l.variantId);
    return [
      Markup.button.callback('➖', CB.lineDec(key)),
      Markup.button.callback(`${l.label} x${l.qty}`, 'noop'),
      Markup.button.callback('➕', CB.lineInc(key)),
      Markup.button.callback('🗑', CB.lineDel(key)),
    ];
  });

  return {
    text: `🛒 *Ton panier*\n\n${receiptBlock(lines, cartTotal(userId))}`,
    keyboard: Markup.inlineKeyboard([
      ...lineRows,
      [Markup.button.callback('✅ Valider la commande', CB.startCheckout())],
      [Markup.button.callback('🗑 Vider le panier', CB.clearCart())],
      [Markup.button.callback('⬅️ Retour au menu', CB.home())],
    ]),
  };
}
