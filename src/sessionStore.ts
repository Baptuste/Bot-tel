/**
 * Store de sessions telegraf adosse a SQLite (table `sessions`).
 *
 * Implemente les 3 mecanismes de nettoyage voulus au cadrage :
 *   1. Sortie de scene   -> `set()` recoit une session vide -> on SUPPRIME la ligne.
 *   2. TTL a la lecture   -> `get()` ignore (et supprime) une session trop vieille.
 *   3. Purge planifiee    -> `purgeSessions()`, appelee par le planificateur.
 *
 * `updated_at` (pas `created_at`) : le TTL se mesure depuis la DERNIERE activite,
 * pour ne pas couper un client au milieu d'un checkout de plusieurs minutes.
 */
import type { SessionStore } from 'telegraf';
import { db } from './db';
import type { BotSession } from './context';

/** Une session inactive depuis plus longtemps est consideree abandonnee. */
export const SESSION_TTL_MINUTES = 60;

const selectSession = db.prepare<[string]>('SELECT data, updated_at FROM sessions WHERE key = ?');
const deleteSession = db.prepare<[string]>('DELETE FROM sessions WHERE key = ?');
const upsertSession = db.prepare<[string, string | null, string]>(`
  INSERT INTO sessions (key, scene, data, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET scene = excluded.scene, data = excluded.data, updated_at = datetime('now')
`);
const purgeStmt = db.prepare(
  `DELETE FROM sessions WHERE updated_at < datetime('now', '-${SESSION_TTL_MINUTES} minutes')`,
);

/** `datetime('now')` renvoie de l'UTC au format 'YYYY-MM-DD HH:MM:SS'. */
function isExpired(updatedAt: string): boolean {
  const ts = Date.parse(`${updatedAt.replace(' ', 'T')}Z`);
  return Number.isNaN(ts) || Date.now() - ts > SESSION_TTL_MINUTES * 60_000;
}

/** Session "vide" = plus rien d'utile a persister (typiquement apres `scene.leave()`). */
function isEmptySession(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length === 0) return true;
  if (keys.length === 1 && keys[0] === '__scenes') {
    const scenes = (value as { __scenes?: { current?: unknown } }).__scenes;
    return !scenes || typeof scenes.current !== 'string';
  }
  return false;
}

function sceneOf(value: unknown): string | null {
  const current = (value as { __scenes?: { current?: unknown } })?.__scenes?.current;
  return typeof current === 'string' ? current : null;
}

export const sqliteSessionStore: SessionStore<BotSession> = {
  get(key) {
    const row = selectSession.get(key) as { data: string; updated_at: string } | undefined;
    if (!row) return undefined;
    if (isExpired(row.updated_at)) {
      deleteSession.run(key);
      return undefined;
    }
    try {
      return JSON.parse(row.data) as BotSession;
    } catch {
      return undefined;
    }
  },

  set(key, value) {
    if (isEmptySession(value)) {
      deleteSession.run(key);
      return;
    }
    upsertSession.run(key, sceneOf(value), JSON.stringify(value));
  },

  delete(key) {
    deleteSession.run(key);
  },
};

/** Supprime les sessions inactives depuis plus de SESSION_TTL_MINUTES. Renvoie le nombre supprime. */
export function purgeSessions(): number {
  return purgeStmt.run().changes;
}
