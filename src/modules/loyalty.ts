/**
 * Module « fidélité » (`features.loyalty.enabled`).
 *
 * Table `loyalty` : un solde de points par client. Points gagnés à chaque
 * commande servie (rôle `fulfilled`). Au palier `rewardThreshold`, le client
 * débloque `rewardLabel` ; l'admin applique la récompense (`redeem`), ce qui
 * retire un palier du solde.
 *
 * Requêtes préparées à la demande : importable même si la table n'existe pas.
 */
import { db } from '../db';
import { features } from '../features';

function buildStatements() {
  return {
    get: db.prepare<[number]>('SELECT points FROM loyalty WHERE user_id = ?'),
    upsert: db.prepare<[number, number]>(`
      INSERT INTO loyalty (user_id, points) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        points = loyalty.points + excluded.points,
        updated_at = datetime('now')
    `),
    set: db.prepare<[number, number]>(`
      INSERT INTO loyalty (user_id, points) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET points = excluded.points, updated_at = datetime('now')
    `),
  };
}

let _statements: ReturnType<typeof buildStatements> | undefined;
function q(): ReturnType<typeof buildStatements> {
  if (!_statements) _statements = buildStatements();
  return _statements;
}

export interface LoyaltyStatus {
  points: number;
  pointsPerOrder: number;
  threshold: number;
  rewardLabel: string;
  /** Récompenses actuellement débloquées (points >= n × palier). */
  rewardsAvailable: number;
  /** Points restants avant la prochaine récompense. */
  toNextReward: number;
}

export function getPoints(userId: number): number {
  const row = q().get.get(userId) as { points: number } | undefined;
  return row?.points ?? 0;
}

export function loyaltyStatus(userId: number): LoyaltyStatus {
  const { pointsPerOrder, rewardThreshold, rewardLabel } = features.loyalty;
  const points = getPoints(userId);
  return {
    points,
    pointsPerOrder,
    threshold: rewardThreshold,
    rewardLabel,
    rewardsAvailable: Math.floor(points / rewardThreshold),
    toNextReward: (rewardThreshold - (points % rewardThreshold)) % rewardThreshold || rewardThreshold,
  };
}

/**
 * Crédite les points d'une commande servie. Renvoie le nouveau statut et si le
 * client vient de franchir un palier (pour le notifier).
 */
export function awardForOrder(userId: number): { status: LoyaltyStatus; crossedThreshold: boolean } {
  const before = Math.floor(getPoints(userId) / features.loyalty.rewardThreshold);
  q().upsert.run(userId, features.loyalty.pointsPerOrder);
  const status = loyaltyStatus(userId);
  return { status, crossedThreshold: status.rewardsAvailable > before };
}

/** L'admin applique une récompense : retire un palier du solde. */
export function redeemReward(userId: number): boolean {
  const points = getPoints(userId);
  if (points < features.loyalty.rewardThreshold) return false;
  q().set.run(userId, points - features.loyalty.rewardThreshold);
  return true;
}
