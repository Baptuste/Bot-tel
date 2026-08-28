/**
 * Petit planificateur maison (pas de dependance).
 *
 *  - toutes les heures : materialise les tournees J / J+1, purge les sessions ;
 *  - toutes les 5 min  : signale a l'admin les commandes en attente depuis trop
 *    longtemps (une seule alerte par commande).
 */
import type { Telegram } from 'telegraf';
import { config } from './config';
import { getOverduePendingIds, markAlerted, PENDING_ALERT_MINUTES } from './dashboard';
import { features } from './features';
import { safeSend } from './orderFlow';
import { ensureUpcomingRoutes } from './routes';
import { purgeSessions } from './sessionStore';

const HOUR = 60 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;

async function checkOverduePending(telegram: Telegram): Promise<void> {
  if (config.adminIds.length === 0) return;
  const ids = getOverduePendingIds();
  if (ids.length === 0) return;

  const list = ids.map((id) => `#${id}`).join(', ');
  const text = `⏰ ${ids.length} commande(s) en attente depuis +${PENDING_ALERT_MINUTES} min : ${list}\nA confirmer ou refuser.`;
  for (const adminId of config.adminIds) {
    await safeSend(telegram, adminId, text);
  }
  markAlerted(ids);
}

export function startScheduler(telegram: Telegram): void {
  const hourly = () => {
    try {
      if (features.deliverySlots.enabled) ensureUpcomingRoutes();
      const purged = purgeSessions();
      if (purged > 0) console.log(`[scheduler] ${purged} session(s) abandonnee(s) purgee(s).`);
    } catch (err) {
      console.error('[scheduler] tick horaire en erreur :', err);
    }
  };

  hourly();
  setInterval(hourly, HOUR).unref();
  setInterval(() => {
    void checkOverduePending(telegram).catch((e) => console.error('[scheduler] alerte attente :', e));
  }, FIVE_MIN).unref();
}
