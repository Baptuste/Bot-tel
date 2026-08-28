/**
 * Configuration métier du déploiement (cf. docs/coeur-et-modules.md).
 *
 * Objet unique, chargé au démarrage, qui pilote quels modules sont actifs et
 * comment ils s'affichent. C'est la pièce qui remplace le raisonnement implicite
 * ("ce bot est fait pour la livraison") par un raisonnement déclaratif
 * ("ce client a activé tel et tel module").
 *
 * Modèle multi-tenant : un process / une base SQLite par client. Ce fichier est
 * le SEUL qui doit changer pour adapter le bot à un nouveau métier.
 *
 * Étape 1 du plan : ce module existe mais AUCUN autre fichier ne le lit encore.
 * Le comportement du bot est strictement identique à avant — juste explicité.
 */

export interface ClientFeatures {
  clientId: string;
  displayName: string;

  /** Mode(s) de remise de la commande. */
  fulfillment: 'delivery' | 'pickup' | 'both';

  /** Étape adresse obligatoire dans le checkout. */
  requiresAddress: boolean;
  /** Étape téléphone obligatoire dans le checkout. */
  requiresPhone: boolean;

  /** Module tournées : table `routes` / `route_templates`, onglet "Tournées". */
  deliverySlots: { enabled: boolean };

  /** Étape "précision de livraison" (étage, code...). `label` = texte affiché au client. */
  deliveryNote: { enabled: boolean; label: string };

  /** Variantes de produit — déjà générique en base, seul le libellé change. */
  variants: { enabled: boolean; label: string }; // "Taille", "Couleur", "Poids"...

  /** Modes de paiement acceptés + pourboire. */
  payment: { methods: Array<'cash' | 'card'>; tipEnabled: boolean };

  /** Fiabilité / no-show — pertinent surtout en livraison à domicile. */
  reliability: { enabled: boolean };
}

/**
 * Client actuel : pizzeria / livraison à domicile.
 * Reproduit EXACTEMENT le comportement du bot d'aujourd'hui.
 */
export const features: ClientFeatures = {
  clientId: 'pizzeria-test',
  displayName: 'Pizzeria Test',

  fulfillment: 'delivery',
  requiresAddress: true,
  requiresPhone: true,

  deliverySlots: { enabled: true },
  deliveryNote: { enabled: true, label: "Etage, code d'acces, batiment..." },
  variants: { enabled: true, label: 'Taille' },
  payment: { methods: ['cash', 'card'], tipEnabled: false },
  reliability: { enabled: true },
};
