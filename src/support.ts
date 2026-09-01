/**
 * Relais de messagerie client <-> admin.
 *
 * Le client tape « Écrire à la boutique » -> son message est transmis a tous
 * les admins avec un bouton « Répondre » ; la reponse de l'admin repart au
 * client. Rien n'est persiste : c'est un simple pont, pas une messagerie.
 */
import { Markup, type Telegram } from 'telegraf';
import { config } from './config';
import { safeSend } from './orderFlow';
import { esc } from './views';

/** Y a-t-il quelqu'un pour recevoir les messages clients ? */
export function supportAvailable(): boolean {
  return config.adminIds.length > 0;
}

export interface ClientIdentity {
  id: number;
  username?: string | undefined;
  name?: string | undefined;
}

/** Transmet un message client a tous les admins (avec bouton « Répondre »). */
export async function relayClientMessage(
  telegram: Telegram,
  from: ClientIdentity,
  text: string,
): Promise<void> {
  const who = from.username ? `@${from.username}` : from.name ? from.name : `client ${from.id}`;
  const msg =
    '💬 <b>Message client</b>\n' +
    `${esc(who)} · <code>${from.id}</code>\n\n` +
    esc(text);
  for (const adminId of config.adminIds) {
    await safeSend(telegram, adminId, msg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('↩️ Répondre', `adm:sreply:${from.id}`)]]),
    });
  }
}

/** Renvoie la reponse de l'admin au client. */
export async function relayAdminReply(
  telegram: Telegram,
  clientId: number,
  text: string,
): Promise<void> {
  await safeSend(
    telegram,
    clientId,
    `💬 <b>Réponse de la boutique</b>\n${esc(text)}`,
    { parse_mode: 'HTML' },
    { alertAdmins: true, context: 'réponse au client' },
  );
}
