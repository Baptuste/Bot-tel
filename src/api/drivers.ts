/**
 * API livreurs (sous-module du module tournees). CRUD simple : l'admin gere la
 * liste dans la Mini App, on s'en sert pour affecter une tournee.
 */
import { Router } from 'express';
import { createDriver, deleteDriver, listDrivers, updateDriver } from '../drivers';
import { requireAdmin } from './auth';

export function driversRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (_req, res) => {
    res.json({ drivers: listDrivers() });
  });

  router.post('/', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'invalid_driver' });
      return;
    }
    const phone = String(req.body?.phone ?? '').trim() || null;
    res.status(201).json({ driver: createDriver({ name, phone }) });
  });

  router.patch('/:id', (req, res) => {
    const patch: { name?: string; phone?: string | null; active?: boolean; position?: number } = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) {
        res.status(400).json({ error: 'invalid_name' });
        return;
      }
      patch.name = name;
    }
    if (req.body?.phone !== undefined) patch.phone = String(req.body.phone).trim() || null;
    if (req.body?.active !== undefined) patch.active = Boolean(req.body.active);
    if (req.body?.position !== undefined) patch.position = Number(req.body.position);

    const driver = updateDriver(Number(req.params.id), patch);
    if (!driver) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ driver });
  });

  router.delete('/:id', (req, res) => {
    res.json({ ok: deleteDriver(Number(req.params.id)) });
  });

  return router;
}
