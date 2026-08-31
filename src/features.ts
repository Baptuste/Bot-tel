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

/**
 * Machine à états d'une commande (cf. feuille-de-route Partie 2, étape 4).
 *
 * Le cœur ne compare plus de statut littéral : il interroge le `role` des étapes.
 * 5 rôles fixes forment le contrat.
 */
export type StageRole = 'placed' | 'accepted' | 'fulfilling' | 'fulfilled' | 'cancelled';

export interface OrderStage {
  /** Valeur stockée en base (`orders.status`). Figée dès qu'un client a des commandes. */
  id: string;
  role: StageRole;
  /** Nom de l'état, forme longue (textes, message de fin de commande). */
  label: string;
  /** Forme courte pour les badges / onglets de la Mini App. Défaut : `label`. */
  shortLabel?: string;
  /** Bouton admin qui fait ENTRER une commande dans cette étape (absent : `placed` / `cancelled`). */
  advanceLabel?: string;
  /** Notif client à l'entrée dans cette étape via avancement. Gabarit `{id}`. */
  arrivalMessage?: string;
  /** Bouton admin pour annuler une commande qui est À cette étape (absent : étapes terminales). */
  cancelLabel?: string;
  /** Notif client quand la commande est annulée depuis cette étape. Gabarit `{id}`. */
  cancelMessage?: string;
}

export interface OrderFlowConfig {
  /** Étapes ordonnées. L'étape `cancelled` est jointe depuis toute étape non terminale. */
  stages: OrderStage[];
}

/**
 * Pipeline « livraison à domicile » — reproduit EXACTEMENT la machine d'origine
 * (pending → confirmed → delivering → delivered, + cancelled).
 */
export const DELIVERY_FLOW: OrderFlowConfig = {
  stages: [
    {
      id: 'pending',
      role: 'placed',
      label: 'en attente de confirmation',
      shortLabel: 'En attente',
      cancelLabel: '❌ Refuser',
      cancelMessage:
        "❌ Ta commande #{id} n'a pas pu etre acceptee. Contacte-nous pour en savoir plus.",
    },
    {
      id: 'confirmed',
      role: 'accepted',
      label: 'confirmee',
      shortLabel: 'Confirmee',
      advanceLabel: '✅ Confirmer',
      arrivalMessage: '✅ Ta commande #{id} est confirmee !\nLivraison estimee : ~45 minutes.',
      cancelLabel: '❌ Annuler',
      cancelMessage: '❌ Ta commande #{id} a ete annulee. Contacte-nous pour en savoir plus.',
    },
    {
      id: 'delivering',
      role: 'fulfilling',
      label: 'en cours de livraison',
      shortLabel: 'En livraison',
      advanceLabel: '🛵 En livraison',
      arrivalMessage: '🛵 Ta commande #{id} est en route !',
      cancelLabel: '❌ Souci',
      cancelMessage: '❌ Ta commande #{id} a ete annulee. Contacte-nous pour en savoir plus.',
    },
    {
      id: 'delivered',
      role: 'fulfilled',
      label: 'livree',
      shortLabel: 'Livree',
      advanceLabel: '📦 Livree',
      arrivalMessage: '📦 Ta commande #{id} a ete livree. Bon appetit ! 🍽',
    },
    { id: 'cancelled', role: 'cancelled', label: 'annulee', shortLabel: 'Annulee' },
  ],
};

/** Pipeline « retrait en boutique » — pas d'étape « en livraison ». */
export const PICKUP_FLOW: OrderFlowConfig = {
  stages: [
    {
      id: 'pending',
      role: 'placed',
      label: 'en attente de confirmation',
      shortLabel: 'En attente',
      cancelLabel: '❌ Refuser',
      cancelMessage:
        "❌ Ta commande #{id} n'a pas pu etre acceptee. Contacte-nous pour en savoir plus.",
    },
    {
      id: 'confirmed',
      role: 'accepted',
      label: 'confirmee',
      shortLabel: 'Confirmee',
      advanceLabel: '✅ Confirmer',
      arrivalMessage:
        '✅ Ta commande #{id} est confirmee ! On te previent des qu\'elle est prete.',
      cancelLabel: '❌ Annuler',
      cancelMessage: '❌ Ta commande #{id} a ete annulee. Contacte-nous pour en savoir plus.',
    },
    {
      id: 'ready',
      role: 'fulfilling',
      label: 'prete a etre retiree',
      shortLabel: 'Prete',
      advanceLabel: '📦 Prete',
      arrivalMessage: '📦 Ta commande #{id} est prete ! Tu peux venir la retirer.',
      cancelLabel: '❌ Souci',
      cancelMessage: '❌ Ta commande #{id} a ete annulee. Contacte-nous pour en savoir plus.',
    },
    {
      id: 'collected',
      role: 'fulfilled',
      label: 'retiree',
      shortLabel: 'Retiree',
      advanceLabel: '✅ Retiree',
      arrivalMessage: '✅ Ta commande #{id} a bien ete retiree. A bientot !',
    },
    { id: 'cancelled', role: 'cancelled', label: 'annulee', shortLabel: 'Annulee' },
  ],
};

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
   * `capacityLimit` : nb max de commandes par créneau par défaut (null = illimité) ;
   *   une capacité posée sur une tournée précise reste prioritaire.
   */
  deliverySlots: { enabled: boolean; drivers: boolean; capacityLimit: number | null };

  /** Étape "précision de livraison" (étage, code...). `label` = texte affiché au client. */
  deliveryNote: { enabled: boolean; label: string };

  /** Variantes de produit — déjà générique en base, seul le libellé change. */
  variants: { enabled: boolean; label: string }; // "Taille", "Couleur", "Poids"...

  /** Modes de paiement acceptés + pourboire. */
  payment: { methods: Array<'cash' | 'card'>; tipEnabled: boolean };

  /** Fiabilité / no-show — pertinent surtout en livraison à domicile. */
  reliability: { enabled: boolean };

  /** Messages pré-écrits réutilisables par l'admin (table `message_templates`, onglet chips). */
  messaging: { templatesEnabled: boolean };

  /**
   * Programme de fidélité (table `loyalty`). Points gagnés par commande servie ;
   * au palier, le client débloque `rewardLabel`, que l'admin applique.
   */
  loyalty: {
    enabled: boolean;
    pointsPerOrder: number;
    rewardThreshold: number;
    rewardLabel: string;
  };

  /**
   * Parrainage (table `referrals`). Le filleul entre le code du parrain via
   * `/parrainage`, gagne `filleulDiscount` € sur sa 1re commande ; le parrain
   * gagne `parrainReward` € sur sa commande suivante (montants en euros).
   */
  referral: { enabled: boolean; filleulDiscount: number; parrainReward: number };

  /** Machine à états d'une commande. */
  orderFlow: OrderFlowConfig;
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

  deliverySlots: { enabled: true, drivers: true, capacityLimit: null },
  deliveryNote: { enabled: true, label: "Etage, code d'acces, batiment..." },
  variants: { enabled: true, label: 'Taille' },
  payment: { methods: ['cash', 'card'], tipEnabled: false },
  reliability: { enabled: true },
  messaging: { templatesEnabled: true },
  loyalty: { enabled: false, pointsPerOrder: 1, rewardThreshold: 10, rewardLabel: '' },
  referral: { enabled: false, filleulDiscount: 0, parrainReward: 0 },
  orderFlow: DELIVERY_FLOW,
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

  deliverySlots: { enabled: false, drivers: false, capacityLimit: null },
  deliveryNote: { enabled: false, label: '' },
  variants: { enabled: false, label: 'Taille' },
  payment: { methods: ['card', 'cash'], tipEnabled: false },
  reliability: { enabled: false },
  messaging: { templatesEnabled: false },
  // Carte de fidélité : 1 point par commande, viennoiserie offerte tous les 10.
  loyalty: {
    enabled: true,
    pointsPerOrder: 1,
    rewardThreshold: 10,
    rewardLabel: 'une viennoiserie offerte',
  },
  // Parrainage : 5 € pour le filleul, 5 € pour le parrain.
  referral: { enabled: true, filleulDiscount: 5, parrainReward: 5 },
  orderFlow: PICKUP_FLOW, // pending → confirmed → ready → collected (pas de « delivering »)
};

const REGISTRY: Record<string, ClientFeatures> = {
  pizzeria,
  'boutique-demo': boutiqueDemo,
};

const active = process.env.CLIENT_ID ?? 'pizzeria';

export const features: ClientFeatures = REGISTRY[active] ?? pizzeria;
