import { createContext, useContext } from 'react';
import type { ClientFeatures, OrderStage, StageRole } from './types';

/**
 * Configuration metier active, chargee une fois par `App` depuis /api/features
 * et distribuee via ce contexte. La Mini App adapte ses onglets et ses libelles
 * a partir de cet objet plutot que d'une liste figee.
 */
export const FeaturesContext = createContext<ClientFeatures | null>(null);

export function useFeatures(): ClientFeatures {
  const f = useContext(FeaturesContext);
  if (!f) throw new Error('FeaturesContext non initialise (App doit envelopper la vue).');
  return f;
}

const NON_TERMINAL: StageRole[] = ['placed', 'accepted', 'fulfilling'];

/** Helpers de la machine à états, dérivés de `features.orderFlow`. */
export function useFlow() {
  const stages = useFeatures().orderFlow.stages;
  const by = (id: string): OrderStage | undefined => stages.find((s) => s.id === id);
  return {
    stages,
    /** Libellé court d'un statut (badge / onglet). */
    label: (id: string) => by(id)?.shortLabel ?? by(id)?.label ?? id,
    role: (id: string): StageRole | undefined => by(id)?.role,
    /** Id de l'étape d'un rôle donné (ex. `roleId('fulfilled')` → 'delivered'). */
    roleId: (role: StageRole): string | undefined => stages.find((s) => s.role === role)?.id,
    /** Statuts « en cours » (ni terminés ni annulés). */
    openIds: () => stages.filter((s) => NON_TERMINAL.includes(s.role)).map((s) => s.id),
    /** Statuts sur lesquels l'admin peut encore modifier une commande. */
    editableIds: () =>
      stages.filter((s) => s.role === 'placed' || s.role === 'accepted').map((s) => s.id),
  };
}
