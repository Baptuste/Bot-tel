/**
 * API clients pour la Mini App admin (gestion clients + fiabilite).
 */
import { Router } from 'express';
import {
  getCustomer,
  getReliability,
  listCustomers,
  updateCustomer,
  type Customer,
} from '../customers';
import { getOrdersByUser } from '../orders';
import { requireAdmin } from './auth';

export function customersRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (_req, res) => {
    res.json({ customers: listCustomers() });
  });

  router.get('/:id', (req, res) => {
    const userId = Number(req.params.id);
    const customer = getCustomer(userId);
    if (!customer) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({
      customer,
      reliability: getReliability(userId),
      orders: getOrdersByUser(userId),
    });
  });

  router.patch('/:id', (req, res) => {
    const b = req.body ?? {};
    const patch: Partial<Pick<Customer, 'name' | 'phone' | 'address' | 'delivery_note' | 'notes' | 'blocked'>> =
      {};
    for (const field of ['name', 'phone', 'address', 'delivery_note', 'notes'] as const) {
      if (b[field] !== undefined) {
        const v = String(b[field]).trim();
        patch[field] = v.length > 0 ? v : null;
      }
    }
    if (b.blocked !== undefined) patch.blocked = Boolean(b.blocked);

    const customer = updateCustomer(Number(req.params.id), patch);
    if (!customer) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ customer });
  });

  return router;
}
