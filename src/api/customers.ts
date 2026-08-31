/**
 * API clients pour la Mini App admin (gestion clients + fiabilite).
 */
import { Router } from 'express';
import { getCustomer, listCustomers, updateCustomer, type Customer } from '../customers';
import { features } from '../features';
import { loyaltyStatus, redeemReward } from '../modules/loyalty';
import { getReliability, listReliability } from '../modules/reliability';
import { referralInfo } from '../modules/referral';
import { getOrdersByUser } from '../orders';
import { requireAdmin } from './auth';

export function customersRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (_req, res) => {
    const customers = listCustomers();
    const rel = features.reliability.enabled ? listReliability() : null;
    res.json({
      customers: customers.map((c) => ({
        ...c,
        reliability: rel?.get(c.user_id) ?? null,
      })),
    });
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
      reliability: features.reliability.enabled ? getReliability(userId) : null,
      loyalty: features.loyalty.enabled ? loyaltyStatus(userId) : null,
      referral: features.referral.enabled ? referralInfo(userId) : null,
      orders: getOrdersByUser(userId),
    });
  });

  // L'admin applique une récompense fidélité (retire un palier du solde).
  router.post('/:id/loyalty/redeem', (req, res) => {
    if (!features.loyalty.enabled) {
      res.status(404).json({ error: 'loyalty_disabled' });
      return;
    }
    const userId = Number(req.params.id);
    if (!redeemReward(userId)) {
      res.status(409).json({ error: 'not_enough_points' });
      return;
    }
    res.json({ loyalty: loyaltyStatus(userId) });
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
