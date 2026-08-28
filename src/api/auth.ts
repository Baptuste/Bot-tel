/**
 * Authentification de la Mini App admin.
 *
 * Telegram signe les donnees de lancement d'une Web App (`initData`) avec une
 * cle derivee du token du bot. On revalide cette signature cote serveur : c'est
 * la SEULE preuve fiable de l'identite de l'utilisateur (le front est manipulable).
 *
 * Algorithme officiel :
 *   secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
 *   hash   = HMAC_SHA256(key=secret, msg=data_check_string)   (hex)
 * ou data_check_string = "cle=valeur" triees par cle, jointes par "\n" (sans "hash").
 */
import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { config } from '../config';

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/** initData accepte jusqu'a 24h apres son emission (limite le rejeu). */
const MAX_AGE_SECONDS = 60 * 60 * 24;

export function verifyInitData(initData: string): TgUser | null {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(computed, 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as TgUser;
    return typeof user.id === 'number' ? user : null;
  } catch {
    return null;
  }
}

export function isAdminUser(user: TgUser | null): user is TgUser {
  return user !== null && config.adminIds.includes(user.id);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: TgUser;
    }
  }
}

/**
 * Middleware : exige un initData valide ET un utilisateur present dans ADMIN_IDS.
 * Le front envoie l'initData dans l'en-tete `Authorization: tma <initData>`.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const header = req.get('authorization') ?? '';
  const initData = header.startsWith('tma ') ? header.slice(4) : (req.get('x-init-data') ?? '');
  const user = verifyInitData(initData);

  if (!user) {
    res.status(401).json({ error: 'invalid_init_data' });
    return;
  }
  if (!isAdminUser(user)) {
    res.status(403).json({ error: 'not_admin' });
    return;
  }

  req.adminUser = user;
  next();
};
