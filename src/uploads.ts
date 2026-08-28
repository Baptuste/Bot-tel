/**
 * Stockage des images produits sur disque (`data/uploads/`).
 *
 * Pas de dependance : la Mini App redimensionne l'image cote client (canvas) et
 * l'envoie en data URL base64. Ici on decode, on valide et on ecrit le fichier.
 * Le bot, lui, envoie la photo directement depuis ce dossier (`{ source: path }`).
 */
import crypto from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const UPLOADS_DIR = resolve(process.cwd(), 'data', 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_BYTES = 6 * 1024 * 1024;

/** Chemin absolu d'une image stockee (pour `sendPhoto` cote bot). */
export function imagePath(filename: string): string {
  return resolve(UPLOADS_DIR, filename);
}

/**
 * Decode une data URL (`data:image/jpeg;base64,...`), ecrit le fichier,
 * renvoie son nom. `null` si le format est invalide ou l'image trop lourde.
 */
export function saveImageDataUrl(dataUrl: string): string | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;

  const mime = match[1] as string;
  const ext = EXT_BY_MIME[mime];
  const buffer = Buffer.from(match[2] as string, 'base64');
  if (!ext || buffer.length === 0 || buffer.length > MAX_BYTES) return null;

  const filename = `${crypto.randomUUID()}.${ext}`;
  writeFileSync(resolve(UPLOADS_DIR, filename), buffer);
  return filename;
}

/** Supprime un fichier image (protege contre les chemins hors du dossier). */
export function deleteImageFile(filename: string | null | undefined): void {
  if (!filename) return;
  const path = resolve(UPLOADS_DIR, filename);
  if (path.startsWith(UPLOADS_DIR) && existsSync(path)) {
    rmSync(path);
  }
}
