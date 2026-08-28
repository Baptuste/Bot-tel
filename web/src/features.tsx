import { createContext, useContext } from 'react';
import type { ClientFeatures } from './types';

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
