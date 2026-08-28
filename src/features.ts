/**
 * Configuration métier du déploiement (cf. docs/coeur-et-modules.md).
 *
 * Objet unique, chargé au démarrage, qui pilote quels modules sont actifs et
 * comment ils s'affichent. C'est la pièce qui remplace le raisonnement implicite
 * ("ce bot est fait pour la livraison") par un raisonnement déclaratif
 * ("ce client a activé tel et tel module").
 *
 * Modèle multi-tenant : un process / une base SQLite par client. En pratique le
 * client actif est choisi par la variable d'environnement `CLIENT_ID`
 * (défaut : `pizzeria`). Ajouter un métier = ajouter une entrée au registre.
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

  /**
   * Module tournées : tables `routes` / `route_templates`, onglet "Tournées".
   * `drivers` : sous-module multi-livreurs (table `drivers`, affectation par tournée).
   */
  deliverySlots: { enabled: boolean; drivers: boolean };

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
 * Client historique : pizzeria / livraison à domicile.
 * Reproduit EXACTEMENT le comportement du bot d'origine.
 */
const pizzeria: ClientFeatures = {
  clientId: 'pizzeria-test',
  displayName: 'Pizzeria Test',

  fulfillment: 'delivery',
  requiresAddress: true,
  requiresPhone: true,

  deliverySlots: { enabled: true, drivers: true },
  deliveryNote: { enabled: true, label: "Etage, code d'acces, batiment..." },
  variants: { enabled: true, label: 'Taille' },
  payment: { methods: ['cash', 'card'], tipEnabled: false },
  reliability: { enabled: true },
};

/**
 * Client fictif de validation (étape 6 du plan) : boutique de vêtements, retrait
 * en magasin, sans tournées. Aucune adresse, pas de créneau, pas de fiabilité.
 * Sert à vérifier que le cœur fonctionne sans être modifié pour ce métier.
 */
const boutiqueDemo: ClientFeatures = {
  clientId: 'boutique-demo',
  displayName: 'Boutique Demo (vetements, retrait)',

  fulfillment: 'pickup',
  requiresAddress: false,
  requiresPhone: true, // on garde le numero pour prevenir "commande prete"

  deliverySlots: { enabled: false, drivers: false },
  deliveryNote: { enabled: false, label: '' },
  variants: { enabled: true, label: 'Taille' },
  payment: { methods: ['card', 'cash'], tipEnabled: false },
  reliability: { enabled: false },
};

const REGISTRY: Record<string, ClientFeatures> = {
  pizzeria,
  'boutique-demo': boutiqueDemo,
};

const active = process.env.CLIENT_ID ?? 'pizzeria';

export const features: ClientFeatures = REGISTRY[active] ?? pizzeria;
