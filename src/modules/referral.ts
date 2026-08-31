/**
 * Module « parrainage » (`features.referral.enabled`).
 *
 * Le code d'un parrain = son `user_id` en base 36 (court, réversible, pas de
 * table de codes). Le filleul l'entre via `/parrainage <code>` AVANT sa première
 * commande. À cette commande :
 *   - le filleul est débité de `filleulDiscount` € ;
 *   - le parrainage passe `pending → completed` et crédite le parrain de
 *     `parrainReward` €, utilisable sur sa commande suivante.
 *
 * Toute la logique monétaire est appliquée dans `scenes/checkout.ts` au moment
 * de créer la commande — `cart.ts` (cœur) n'est pas touché.
 */
import { db } from '../db';
import { getCustomer } from '../customers';
import { features } from '../features';
import { getOrdersByUser } from '../orders';

interface ReferralRow {
  id: number;
  parrain_id: number;
  filleul_id: number;
  status: 'pending' | 'completed';
  filleul_discount: number;
  parrain_reward: number;
  reward_consumed: number;
}

function buildStatements() {
  return {
    byId: db.prepare<[number]>('SELECT * FROM referrals WHERE id = ?'),
    byFilleul: db.prepare<[number]>('SELECT * FROM referrals WHERE filleul_id = ?'),
    parrainCompleted: db.prepare<[number]>(
      "SELECT * FROM referrals WHERE parrain_id = ? AND status = 'completed' ORDER BY completed_at",
    ),
    insert: db.prepare<[number, number]>('INSERT INTO referrals (parrain_id, filleul_id) VALUES (?, ?)'),
    complete: db.prepare<[number, number, number]>(`
      UPDATE referrals
      SET status = 'completed', filleul_discount = ?, parrain_reward = ?, completed_at = datetime('now')
      WHERE id = ?
    `),
    consume: db.prepare<[number]>('UPDATE referrals SET reward_consumed = 1 WHERE id = ?'),
    reduceReward: db.prepare<[number, number]>(
      'UPDATE referrals SET parrain_reward = parrain_reward - ? WHERE id = ?',
    ),
  };
}

let _statements: ReturnType<typeof buildStatements> | undefined;
function q(): ReturnType<typeof buildStatements> {
  if (!_statements) _statements = buildStatements();
  return _statements;
}

/** Code de parrainage d'un client (à partager). */
export function codeFor(userId: number): string {
  return userId.toString(36).toUpperCase();
}

function userForCode(code: string): number | null {
  const n = parseInt(code.trim(), 36);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type RegisterResult =
  | { ok: true; parrainId: number }
  | {
      ok: false;
      reason: 'code_invalide' | 'auto_parrainage' | 'parrain_inconnu' | 'deja_parraine' | 'trop_tard';
    };

/** Enregistre un filleul sous le code d'un parrain. */
export function registerFilleul(filleulId: number, code: string): RegisterResult {
  const parrainId = userForCode(code);
  if (parrainId === null) return { ok: false, reason: 'code_invalide' };
  if (parrainId === filleulId) return { ok: false, reason: 'auto_parrainage' };
  if (!getCustomer(parrainId)) return { ok: false, reason: 'parrain_inconnu' };
  if (q().byFilleul.get(filleulId)) return { ok: false, reason: 'deja_parraine' };
  if (getOrdersByUser(filleulId).length > 0) return { ok: false, reason: 'trop_tard' };
  q().insert.run(parrainId, filleulId);
  return { ok: true, parrainId };
}

export interface ReferralInfo {
  code: string;
  filleulDiscount: number;
  parrainReward: number;
  pendingAsFilleul: boolean;
  filleulsCompleted: number;
  creditAvailable: number;
}

export function referralInfo(userId: number): ReferralInfo {
  const filleulRow = q().byFilleul.get(userId) as ReferralRow | undefined;
  const completed = q().parrainCompleted.all(userId) as ReferralRow[];
  return {
    code: codeFor(userId),
    filleulDiscount: features.referral.filleulDiscount,
    parrainReward: features.referral.parrainReward,
    pendingAsFilleul: filleulRow?.status === 'pending',
    filleulsCompleted: completed.length,
    creditAvailable: completed
      .filter((r) => r.reward_consumed === 0)
      .reduce((s, r) => s + r.parrain_reward, 0),
  };
}

export interface CheckoutPreview {
  discount: number; // total de la réduction parrainage
  lines: string[];
  filleul: { rowId: number; discount: number } | null;
  parrainConsume: Array<{ id: number; amount: number; full: boolean }>;
}

/** Réduction parrainage applicable à une commande — LECTURE SEULE. */
export function previewCheckout(userId: number, cartTotal: number): CheckoutPreview {
  const lines: string[] = [];
  let discount = 0;

  // 1. Le client est un filleul qui passe sa première commande.
  let filleul: CheckoutPreview['filleul'] = null;
  const filleulRow = q().byFilleul.get(userId) as ReferralRow | undefined;
  if (filleulRow?.status === 'pending' && getOrdersByUser(userId).length === 0) {
    const d = Math.min(features.referral.filleulDiscount, cartTotal - discount);
    if (d > 0) {
      discount += d;
      filleul = { rowId: filleulRow.id, discount: d };
      lines.push(`Parrainage (bienvenue) : -${d} EUR`);
    }
  }

  // 2. Le client est un parrain avec un crédit non utilisé.
  const parrainConsume: CheckoutPreview['parrainConsume'] = [];
  let used = 0;
  for (const r of q().parrainCompleted.all(userId) as ReferralRow[]) {
    if (r.reward_consumed === 1 || r.parrain_reward <= 0) continue;
    const budget = cartTotal - discount;
    if (budget <= 0) break;
    const take = Math.min(r.parrain_reward, budget);
    parrainConsume.push({ id: r.id, amount: take, full: take === r.parrain_reward });
    discount += take;
    used += take;
  }
  if (used > 0) lines.push(`Parrainage (merci !) : -${used} EUR`);

  return { discount, lines, filleul, parrainConsume };
}

/** Applique la réduction en base après création de la commande. Renvoie le parrain à notifier. */
export function commitCheckout(p: CheckoutPreview): { parrainToNotify: number | null } {
  let parrainToNotify: number | null = null;

  if (p.filleul) {
    q().complete.run(p.filleul.discount, features.referral.parrainReward, p.filleul.rowId);
    const row = q().byId.get(p.filleul.rowId) as ReferralRow;
    parrainToNotify = row.parrain_id;
  }
  for (const c of p.parrainConsume) {
    if (c.full) q().consume.run(c.id);
    else q().reduceReward.run(c.amount, c.id);
  }

  return { parrainToNotify };
}
