/**
 * Types partages du domaine.
 *
 * Principe directeur du projet : les DONNEES (menu) sont separees de la LOGIQUE (bot).
 * Ici on decrit uniquement la FORME des donnees, pas leur contenu.
 */

/** Une taille/variante d'un produit (id sous forme de chaine pour la callback_data). */
export interface MenuVariant {
  id: string;
  label: string;
  price: number;
}

/**
 * Un produit du menu.
 * - `variants` vide  -> produit simple, `price` = son prix.
 * - `variants` rempli -> `price` = prix "a partir de" (le client choisit la taille).
 */
export interface MenuItem {
  label: string;
  price: number;
  description: string;
  variants: MenuVariant[];
  /** Nom de fichier image dans data/uploads/ (ou null). */
  image: string | null;
}

/** Une categorie : un libelle + un dictionnaire de produits indexes par id. */
export interface MenuCategory {
  label: string;
  items: Record<string, MenuItem>;
}

/** Le menu complet : un dictionnaire de categories indexees par id. */
export type Menu = Record<string, MenuCategory>;

/** Une ligne de panier (produit + taille eventuelle + quantite), en memoire. */
export interface CartLine {
  catId: string;
  prodId: string;
  variantId?: string;
  label: string;
  price: number;
  qty: number;
}
