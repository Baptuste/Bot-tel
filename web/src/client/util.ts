const PICTO = /\p{Extended_Pictographic}/u;

/**
 * Glyphe affiché à la place d'une photo manquante : l'emoji de la catégorie
 * si elle en porte un (ex. « 🍕 Pizzas »), sinon l'initiale du produit.
 * Évite le rendu « texte tronqué » d'un slice(0, 2).
 */
export function placeholderGlyph(catLabel: string | undefined, productLabel: string): string {
  const m = catLabel?.match(PICTO);
  if (m) return m[0];
  return productLabel.trim().slice(0, 1).toUpperCase() || '·';
}
