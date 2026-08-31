/**
 * Module « fiabilité » : taux livrées / no-show d'un client.
 *
 * Piloté par `features.reliability.enabled`. Rien n'est stocké — tout est CALCULÉ
 * depuis `orders` (pas de drift). Une annulation « no-show » (imputée au client)
 * compte contre lui ; une annulation légitime (rupture de stock...) non.
 *
 * Extrait de `customers.ts` (refactoring cœur, étape 1) : la fiche client reste
 * dans le cœur, ce calcul métier n'y est plus.
 */
import { db } from '../db';
import { openStatusIds, requireRole } from '../orderStages';

const FULFILLED_ID = requireRole('fulfilled').id;
const CANCELLED_ID = requireRole('cancelled').id;
const OPEN_IDS = openStatusIds();
const openPlaceholders = OPEN_IDS.map(() => '?').join(', ');

export interface Reliability {
  total: number;
  delivered: number;
  noShow: number;
  cancelledOther: number;
  active: number;
  /** livrées / (livrées + no-show), ou null si le client n'a encore aucune des deux. */
  rate: number | null;
}

/** Version allégée pour les badges / la liste clients. */
export interface ReliabilitySummary {
  delivered: number;
  noShow: number;
  rate: number | null;
}

const q = {
  one: db.prepare(`
    SELECT
      COUNT(*)                                            AS total,
      COALESCE(SUM(status = ?), 0)                        AS delivered,
      COALESCE(SUM(no_show = 1), 0)                       AS noShow,
      COALESCE(SUM(status = ? AND no_show = 0), 0)        AS cancelledOther,
      COALESCE(SUM(status IN (${openPlaceholders})), 0)   AS active
    FROM orders WHERE user_id = ?
  `),
  all: db.prepare(`
    SELECT user_id,
      COALESCE(SUM(status = ?), 0) AS delivered,
      COALESCE(SUM(no_show = 1), 0) AS noShow
    FROM orders
    GROUP BY user_id
  `),
};

function withRate<T extends { delivered: number; noShow: number }>(r: T): T & { rate: number | null } {
  const judged = r.delivered + r.noShow;
  return { ...r, rate: judged > 0 ? r.delivered / judged : null };
}

/** Fiabilité détaillée d'un client (fiche client). */
export function getReliability(userId: number): Reliability {
  const r = q.one.get(FULFILLED_ID, CANCELLED_ID, ...OPEN_IDS, userId) as Omit<Reliability, 'rate'>;
  return withRate(r);
}

/** Résumé par client, en une requête — pour la liste de la Mini App. */
export function listReliability(): Map<number, ReliabilitySummary> {
  const rows = q.all.all(FULFILLED_ID) as Array<{
    user_id: number;
    delivered: number;
    noShow: number;
  }>;
  return new Map(rows.map((row) => [row.user_id, withRate(row)]));
}
