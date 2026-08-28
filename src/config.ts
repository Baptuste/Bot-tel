/**
 * Chargement et validation des variables d'environnement.
 *
 * Le token du bot ne doit JAMAIS etre code en dur : il vient de .env (non commite).
 */
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Variable d'environnement manquante : ${name}.\n` +
        `-> Copie .env.example en .env et renseigne ${name}.`,
    );
  }
  return value.trim();
}

/** Liste d'entiers separes par des virgules (ex: "123,456"). Vide si absente. */
function idList(name: string): number[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function optional(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export const config = {
  /** Token du bot de test fourni par BotFather. */
  botToken: required('BOT_TOKEN'),

  /** user_id Telegram autorises a utiliser les commandes admin / la Mini App. */
  adminIds: idList('ADMIN_IDS'),

  /** Port du serveur HTTP (API + Mini App). */
  port: Number(optional('PORT') ?? 3000),

  /**
   * URL publique HTTPS ou la Mini App est servie (ex: tunnel cloudflared).
   * Necessaire pour le bouton "Ouvrir l'admin" et le menu Web App.
   * Absente -> le bot reste utilisable, seulement sans Mini App.
   */
  webAppUrl: optional('WEBAPP_URL'),
};
