import { Router } from 'express';
import { getDashboard } from '../dashboard';
import { requireAdmin } from './auth';

export function dashboardRouter(): Router {
  const router = Router();
  router.use(requireAdmin);
  router.get('/', (_req, res) => {
    res.json(getDashboard());
  });
  return router;
}
