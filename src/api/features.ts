/**
 * Configuration metier exposee a la Mini App.
 *
 * Le front n'a pas de liste d'onglets figee : il lit cette config au demarrage
 * et adapte son UI (onglet Tournees, libelle des variantes...). Aucun secret
 * ici — c'est le contenu de `src/features.ts`, deja cote client par nature.
 */
import { Router } from 'express';
import { features } from '../features';
import { requireAdmin } from './auth';

export function featuresRouter(): Router {
  const router = Router();
  router.use(requireAdmin);
  router.get('/', (_req, res) => {
    res.json(features);
  });
  return router;
}
