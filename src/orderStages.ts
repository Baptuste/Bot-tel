/**
 * Helpers de la machine à états d'une commande (cf. feuille-de-route étape 4).
 *
 * Le cœur ne compare plus jamais un statut littéral (`=== 'delivered'`) : il
 * interroge le RÔLE des étapes via ces helpers. Ce fichier ne dépend que de
 * `features.ts` — pas de cycle avec `orders.ts` / `orderFlow.ts`.
 */
import { features, type OrderFlowConfig, type OrderStage, type StageRole } from './features';

const STAGES = features.orderFlow.stages;

/**
 * Valide `features.orderFlow` au démarrage : mieux vaut planter tôt qu'à la
 * première commande. Le cœur suppose ces invariants partout ensuite.
 */
export function validateOrderFlow(cfg: OrderFlowConfig): void {
  const err = (m: string): never => {
    throw new Error(`features.orderFlow invalide : ${m}`);
  };
  const ids = cfg.stages.map((s) => s.id);
  if (new Set(ids).size !== ids.length) err(`ids d'étape en double (${ids.join(', ')})`);
  // Les ids voyagent dans les callback_data Telegram (`adm:status:12:<id>`).
  for (const id of ids) {
    if (!/^\w+$/.test(id)) err(`id d'étape "${id}" invalide (lettres, chiffres, _ uniquement)`);
  }

  for (const role of ['placed', 'fulfilled', 'cancelled'] as StageRole[]) {
    if (cfg.stages.filter((s) => s.role === role).length !== 1) {
      err(`il faut exactement une étape de rôle "${role}"`);
    }
  }
  for (const role of ['accepted', 'fulfilling'] as StageRole[]) {
    if (cfg.stages.filter((s) => s.role === role).length > 1) err(`rôle "${role}" en double`);
  }
  if (cfg.stages[0]?.role !== 'placed') err(`la première étape doit être de rôle "placed"`);

  // Le module tournées suppose des étapes "accepted" (affectation) et "fulfilling"
  // (en cours de livraison).
  if (features.deliverySlots.enabled) {
    for (const role of ['accepted', 'fulfilling'] as StageRole[]) {
      if (!cfg.stages.some((s) => s.role === role)) {
        err(`le module tournées exige une étape de rôle "${role}"`);
      }
    }
  }

  // Rôles linéaires dans l'ordre canonique.
  const order: StageRole[] = ['placed', 'accepted', 'fulfilling', 'fulfilled'];
  const seen = cfg.stages.filter((s) => s.role !== 'cancelled').map((s) => order.indexOf(s.role));
  for (let i = 1; i < seen.length; i++) {
    if (seen[i]! <= seen[i - 1]!) err(`ordre des étapes incohérent avec les rôles`);
  }
}

validateOrderFlow(features.orderFlow);

// --- Lecture -------------------------------------------------------------

/** Toutes les étapes, dans l'ordre du pipeline. */
export function orderStages(): readonly OrderStage[] {
  return STAGES;
}

export function stageById(id: string): OrderStage | undefined {
  return STAGES.find((s) => s.id === id);
}

export function stageByRole(role: StageRole): OrderStage | undefined {
  return STAGES.find((s) => s.role === role);
}

/** Étape d'un rôle dont on sait qu'il existe dans ce contexte (sinon : erreur claire). */
export function requireRole(role: StageRole): OrderStage {
  const s = stageByRole(role);
  if (!s) throw new Error(`Aucune étape de rôle "${role}" dans features.orderFlow`);
  return s;
}

/** Id du statut initial d'une commande (`orders.status` à la création). */
export function initialStatusId(): string {
  return requireRole('placed').id;
}

/** Libellé lisible d'un statut (badge, texte). Repli sur l'id si inconnu. */
export function statusLabel(id: string): string {
  return stageById(id)?.label ?? id;
}

/** Statut terminal (livrée/récupérée ou annulée) : aucune transition sortante. */
export function isTerminalStatus(id: string): boolean {
  const role = stageById(id)?.role;
  return role === 'fulfilled' || role === 'cancelled';
}

/** Statuts « en cours » : ni terminés ni annulés (placed / accepted / fulfilling). */
export function openStatusIds(): string[] {
  return STAGES.filter((s) => s.role !== 'fulfilled' && s.role !== 'cancelled').map((s) => s.id);
}

/**
 * Statuts sur lesquels l'admin peut encore modifier / affecter une commande :
 * avant qu'elle ne parte en livraison (rôles placed / accepted).
 */
export function editableStatusIds(): string[] {
  return STAGES.filter((s) => s.role === 'placed' || s.role === 'accepted').map((s) => s.id);
}
