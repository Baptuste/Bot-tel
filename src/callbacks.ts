/**
 * callback_data structuree.
 *
 * Regle du projet : PAS un `bot.action` par bouton.
 * On encode l'intention dans une chaine "namespace:action:arg1:arg2", et un
 * SEUL listener generique (voir index.ts) la parse et route vers la bonne vue.
 *
 * Rappel : Telegram limite callback_data a 64 octets -> on garde des ids courts.
 */

/** Fabriques de callback_data (utilisees pour construire les boutons). */
export const CB = {
  home: () => 'nav:home',
  contact: () => 'nav:contact',
  category: (catId: string) => `nav:cat:${catId}`,
  product: (catId: string, prodId: string) => `nav:prod:${catId}:${prodId}`,
  addToCart: (catId: string, prodId: string) => `cart:add:${catId}:${prodId}`,
  addVariant: (catId: string, prodId: string, variantId: string) =>
    `cart:addv:${catId}:${prodId}:${variantId}`,
  lineInc: (key: string) => `cart:linc:${key}`,
  lineDec: (key: string) => `cart:ldec:${key}`,
  lineDel: (key: string) => `cart:ldel:${key}`,
  showCart: () => 'cart:show',
  clearCart: () => 'cart:clear',
  startCheckout: () => 'order:start',
} as const;

/** Regex du listener generique : nav: (navigation), cart: (panier), order: (commande). */
export const CALLBACK_PATTERN = /^(nav|cart|order):/;

/** Resultat du parsing d'une callback_data. */
export type ParsedCallback =
  | { kind: 'home' }
  | { kind: 'contact' }
  | { kind: 'category'; catId: string }
  | { kind: 'product'; catId: string; prodId: string }
  | { kind: 'addToCart'; catId: string; prodId: string }
  | { kind: 'addVariant'; catId: string; prodId: string; variantId: string }
  | { kind: 'lineInc'; key: string }
  | { kind: 'lineDec'; key: string }
  | { kind: 'lineDel'; key: string }
  | { kind: 'showCart' }
  | { kind: 'clearCart' }
  | { kind: 'startCheckout' }
  | { kind: 'unknown' };

export function parseCallback(data: string): ParsedCallback {
  const parts = data.split(':');
  const [ns, action, arg1, arg2, arg3] = parts;

  if (ns === 'nav') {
    if (action === 'home') return { kind: 'home' };
    if (action === 'contact') return { kind: 'contact' };
    if (action === 'cat' && arg1) return { kind: 'category', catId: arg1 };
    if (action === 'prod' && arg1 && arg2) {
      return { kind: 'product', catId: arg1, prodId: arg2 };
    }
  }

  if (ns === 'cart') {
    if (action === 'add' && arg1 && arg2) {
      return { kind: 'addToCart', catId: arg1, prodId: arg2 };
    }
    if (action === 'addv' && arg1 && arg2 && arg3) {
      return { kind: 'addVariant', catId: arg1, prodId: arg2, variantId: arg3 };
    }
    // key = catId:prodId:variantId -> peut contenir des ':' -> on recolle
    const key = parts.slice(2).join(':');
    if (action === 'linc' && key) return { kind: 'lineInc', key };
    if (action === 'ldec' && key) return { kind: 'lineDec', key };
    if (action === 'ldel' && key) return { kind: 'lineDel', key };
    if (action === 'show') return { kind: 'showCart' };
    if (action === 'clear') return { kind: 'clearCart' };
  }

  if (ns === 'order' && action === 'start') return { kind: 'startCheckout' };

  return { kind: 'unknown' };
}
