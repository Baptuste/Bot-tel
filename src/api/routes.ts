/**
 * API tournees pour la Mini App admin.
 *
 * Comme pour les commandes : ces routes valident l'entree et delèguent a `routes.ts`.
 * Demarrer / terminer une tournee notifie les clients (via `changeStatus`).
 */
import { Router } from 'express';
import type { Telegram } from 'telegraf';
import {
  assignOrder,
  createRoute,
  createTemplate,
  deleteRoute,
  deleteTemplate,
  finishRoute,
  moveOrder,
  routesOverview,
  startRoute,
  unassignOrder,
  updateTemplate,
  type RouteTemplate,
} from '../routes';
import { requireAdmin } from './auth';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseCapacity(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function routesRouter(telegram: Telegram): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (_req, res) => {
    res.json(routesOverview());
  });

  // --- Modeles de tournees (creneaux recurrents) ---

  router.post('/templates', (req, res) => {
    const label = String(req.body?.label ?? '').trim();
    const time = String(req.body?.time ?? '').trim();
    if (!label || !TIME_RE.test(time)) {
      res.status(400).json({ error: 'invalid_template' });
      return;
    }
    res.status(201).json({
      template: createTemplate({ label, time, max_capacity: parseCapacity(req.body?.max_capacity) }),
    });
  });

  router.patch('/templates/:id', (req, res) => {
    const patch: Partial<Omit<RouteTemplate, 'id'>> = {};
    if (req.body?.label !== undefined) patch.label = String(req.body.label).trim();
    if (req.body?.time !== undefined) {
      const time = String(req.body.time).trim();
      if (!TIME_RE.test(time)) {
        res.status(400).json({ error: 'invalid_time' });
        return;
      }
      patch.time = time;
    }
    if (req.body?.active !== undefined) patch.active = Boolean(req.body.active);
    if (req.body?.max_capacity !== undefined) patch.max_capacity = parseCapacity(req.body.max_capacity);
    if (req.body?.position !== undefined) patch.position = Number(req.body.position);

    const template = updateTemplate(Number(req.params.id), patch);
    if (!template) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ template });
  });

  router.delete('/templates/:id', (req, res) => {
    res.json({ ok: deleteTemplate(Number(req.params.id)) });
  });

  router.post('/', (req, res) => {
    const date = String(req.body?.date ?? '').trim();
    const timeSlot = String(req.body?.time_slot ?? '').trim();
    if (!DATE_RE.test(date) || !timeSlot) {
      res.status(400).json({ error: 'invalid_route' });
      return;
    }
    res.status(201).json({ route: createRoute(date, timeSlot) });
  });

  router.post('/:id/assign', (req, res) => {
    const order = assignOrder(Number(req.params.id), Number(req.body?.order_id));
    if (!order) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ order });
  });

  router.post('/:id/unassign', (req, res) => {
    const order = unassignOrder(Number(req.body?.order_id));
    if (!order) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ order });
  });

  // Reordonne une commande dans la file de livraison de la tournee.
  router.post('/:id/move', (req, res) => {
    const dir = req.body?.dir === 'up' ? 'up' : req.body?.dir === 'down' ? 'down' : null;
    if (!dir) {
      res.status(400).json({ error: 'invalid_dir' });
      return;
    }
    const order = moveOrder(Number(req.params.id), Number(req.body?.order_id), dir);
    if (!order) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ order });
  });

  router.post('/:id/start', async (req, res) => {
    const route = await startRoute(telegram, Number(req.params.id));
    if (!route) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ route });
  });

  router.post('/:id/finish', async (req, res) => {
    const route = await finishRoute(telegram, Number(req.params.id));
    if (!route) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ route });
  });

  router.delete('/:id', (req, res) => {
    res.json({ ok: deleteRoute(Number(req.params.id)) });
  });

  return router;
}
