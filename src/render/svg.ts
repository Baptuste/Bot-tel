/**
 * Rendu SVG -> PNG pour les cartes-images du bot client.
 *
 * On compose les cartes en SVG (controle total de la mise en page), puis resvg
 * (WASM, pas de compilation) rasterise en PNG. Polices IBM Plex Mono embarquees
 * dans `assets/fonts/` -> rendu identique quelle que soit la machine.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const FONT_DIR = path.resolve(process.cwd(), 'assets', 'fonts');
const fontFiles = [
  'IBMPlexMono-Regular.ttf',
  'IBMPlexMono-SemiBold.ttf',
  'IBMPlexMono-MediumItalic.ttf',
].map((f) => path.join(FONT_DIR, f));

/** Rasterise un SVG en PNG (Buffer), a la largeur donnee. */
export function svgToPng(svg: string, width: number): Buffer {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'IBM Plex Mono' },
    background: 'rgba(0,0,0,0)',
  });
  return r.render().asPng();
}

// --- Palette « bon de commande » -------------------------------------------

export const INK = '#201c17';
export const PAPER = '#f4f1ea';
export const RED = '#c6402f';
export const MUTED = '#6b6256';
export const LINE = '#c9c2b4';

// --- Helpers de mise en page monospace -------------------------------------

/** Largeur d'un caractere IBM Plex Mono a une taille donnee (ratio mesure ~0.6). */
export const MONO_RATIO = 0.6;
export const charW = (fontSize: number): number => fontSize * MONO_RATIO;

/** Nb max de caracteres tenant dans `px` a `fontSize`. */
export const fitChars = (px: number, fontSize: number): number =>
  Math.floor(px / charW(fontSize));

/** Tronque avec … si trop long. */
export function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
}

/** Retire les emoji (les polices des cartes n'en ont pas — et une carte imprimee n'en a pas). */
export function stripEmoji(s: string): string {
  return s
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Echappe le texte pour l'inserer dans un <text> SVG. */
export function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ligne avec points de conduite : "Nom .......... 9 €" sur `cols` colonnes. */
export function leaderRow(left: string, right: string, cols: number): string {
  const l = clip(left, cols - right.length - 2);
  const dots = Math.max(2, cols - l.length - right.length - 2);
  return `${l} ${'.'.repeat(dots)} ${right}`;
}

/** Coupe un texte en lignes de `cols` caracteres max (coupe aux espaces). */
export function wrap(text: string, cols: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur === '') cur = w;
    else if (`${cur} ${w}`.length <= cols) cur += ` ${w}`;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}
