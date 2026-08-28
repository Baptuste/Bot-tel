/**
 * Type de contexte du bot.
 *
 * On etend le Context de telegraf pour y brancher :
 *  - `session` : etat par utilisateur (support des scenes / wizards) ;
 *  - `scene`   : l'API des scenes (etat de conversation multi-etapes) ;
 *  - `wizard`  : l'API des WizardScene (scenes lineaires a etapes numerotees).
 *
 * IMPORTANT (principe du projet) : la session est de l'etat TEMPORAIRE, a ne pas
 * confondre avec une commande (donnee definitive, persistee en base).
 * En V1 la session vit en memoire (middleware `session()` par defaut).
 */
import type { Context, Scenes } from 'telegraf';

/** Donnees transportees par la scene "quantite" (BaseScene). */
export interface QuantityState {
  catId: string;
  prodId: string;
  variantId?: string;
  label: string;
  price: number;
}

/** Donnees transportees par la scene "checkout" (WizardScene). */
export interface CheckoutState {
  address?: string;
  phone?: string;
  /** Derniere adresse / dernier numero connus (pre-remplissage), charges a l'entree. */
  lastAddress?: string;
  lastPhone?: string;
  /** Creneau choisi : id de la tournee, ou null pour "au plus tot". */
  routeId?: number | null;
  slotLabel?: string;
  /** Precision de livraison (etage, code), + celle deja connue pour la proposer. */
  deliveryNote?: string;
  lastNote?: string;
}

interface WizardData extends Scenes.WizardSessionData {}

export interface BotSession extends Scenes.WizardSession<WizardData> {}

export interface BotContext extends Context {
  session: BotSession;
  scene: Scenes.SceneContextScene<BotContext, WizardData>;
  wizard: Scenes.WizardContextWizard<BotContext>;
}

/**
 * Identifiant Telegram de l'utilisateur courant.
 * `ctx.from` est optionnel dans les types de telegraf : pour tous les updates
 * qu'on traite (messages, clics sur bouton) il est toujours present, mais on
 * verifie quand meme plutot que de disperser des `!` dans le code.
 */
export function userId(ctx: Context): number {
  if (!ctx.from) throw new Error('Update sans utilisateur (ctx.from manquant).');
  return ctx.from.id;
}
