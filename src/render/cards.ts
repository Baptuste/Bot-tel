/**
 * Gabarits SVG des cartes-images du bot client.
 * Identite « bon de commande » : papier, encre, tampon rouge, filets pointilles.
 */
import { features } from '../features';
import type { CartLine } from '../types';
import {
  charW,
  clip,
  INK,
  leaderRow,
  LINE,
  MUTED,
  PAPER,
  RED,
  stripEmoji,
  svgToPng,
  wrap,
  xml,
} from './svg';

// ---------------------------------------------------------------------------
// Ticket de caisse (panier / recap)
// ---------------------------------------------------------------------------

interface ReceiptOpts {
  title: string; // "Panier" | "Récapitulatif"
  items: Pick<CartLine, 'label' | 'qty' | 'price'>[];
  discounts?: { label: string; amount: number }[]; // montants negatifs affiches -x €
  total: number;
  footerLines?: string[]; // adresse / créneau / paiement
}

const R_W = 760; // largeur de la carte
const R_PAD = 54; // marge interieure gauche/droite du texte
const R_FS = 26; // taille de police du corps
const R_COLS = Math.floor((R_W - 2 * R_PAD) / charW(R_FS)); // ~ 40

function dashedRule(y: number): string {
  return `<line x1="${R_PAD}" y1="${y}" x2="${R_W - R_PAD}" y2="${y}" stroke="${INK}" stroke-width="2" stroke-dasharray="2 6" opacity="0.55"/>`;
}
function solidRule(y: number): string {
  return `<line x1="${R_PAD}" y1="${y}" x2="${R_W - R_PAD}" y2="${y}" stroke="${INK}" stroke-width="3"/>`;
}
function row(y: number, text: string, opts: { bold?: boolean; muted?: boolean; size?: number } = {}): string {
  const size = opts.size ?? R_FS;
  return `<text x="${R_PAD}" y="${y}" font-family="IBM Plex Mono" font-size="${size}" font-weight="${
    opts.bold ? 600 : 400
  }" fill="${opts.muted ? MUTED : INK}" xml:space="preserve">${xml(text)}</text>`;
}
function centered(y: number, text: string, opts: { size?: number; muted?: boolean; italic?: boolean } = {}): string {
  const size = opts.size ?? R_FS;
  return `<text x="${R_W / 2}" y="${y}" text-anchor="middle" font-family="IBM Plex Mono" font-size="${size}" ${
    opts.italic ? 'font-style="italic"' : ''
  } fill="${opts.muted ? MUTED : INK}">${xml(text)}</text>`;
}

export function receiptPng(o: ReceiptOpts): Buffer {
  const parts: string[] = [];
  let y = 96;

  parts.push(centered(y, stripEmoji(features.displayName).toUpperCase(), { size: 30 }));
  y += 34;
  parts.push(centered(y, `~ ${o.title.toLowerCase()} ~`, { size: 20, muted: true, italic: true }));
  y += 22;
  parts.push(solidRule(y), solidRule(y + 5));
  y += 42;

  for (const it of o.items) {
    const right = `${it.price * it.qty} €`;
    const left = `${clip(stripEmoji(it.label), R_COLS - right.length - 8)} ×${it.qty}`;
    parts.push(row(y, leaderRow(left, right, R_COLS)));
    y += R_FS + 12;
  }

  parts.push(dashedRule(y - 4));
  y += 20;

  const sub = o.items.reduce((s, i) => s + i.price * i.qty, 0);
  if (o.discounts && o.discounts.length > 0) {
    parts.push(row(y, leaderRow('Sous-total', `${sub} €`, R_COLS), { muted: true }));
    y += R_FS + 8;
    for (const d of o.discounts) {
      parts.push(row(y, leaderRow(d.label, `-${d.amount} €`, R_COLS), { muted: true }));
      y += R_FS + 8;
    }
  }

  parts.push(solidRule(y), solidRule(y + 5));
  y += 44;
  parts.push(row(y, leaderRow('TOTAL', `${o.total} €`, R_COLS), { bold: true }));
  y += 38;

  if (o.footerLines && o.footerLines.length > 0) {
    parts.push(dashedRule(y - 4));
    y += 30;
    for (const f of o.footerLines) {
      for (const line of wrap(f, R_COLS)) {
        parts.push(row(y, line, { muted: true, size: 22 }));
        y += 28;
      }
    }
    y += 6;
  }

  // faux code-barres
  y += 14;
  let bx = R_PAD;
  const bars: string[] = [];
  const seed = o.total * 37 + o.items.length * 13;
  for (let i = 0; i < 46; i++) {
    const w = ((seed >> i % 8) & 1 ? 3 : 6) + ((i * 7) % 4);
    if (i % 2 === 0) bars.push(`<rect x="${bx}" y="${y}" width="${w}" height="46" fill="${INK}"/>`);
    bx += w + 3;
  }
  parts.push(...bars);
  y += 46 + 30;
  parts.push(centered(y, 'merci & à bientôt', { size: 20, muted: true, italic: true }));
  y += 40;

  const H = y + 20;

  // bord inferieur "dechire"
  let tear = `M0 ${H - 14}`;
  for (let x = 0; x <= R_W; x += 24) tear += ` L${x + 12} ${H - 2} L${x + 24} ${H - 14}`;
  tear += ` L${R_W} ${H} L0 ${H} Z`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${R_W}" height="${H}" viewBox="0 0 ${R_W} ${H}">
    <rect width="${R_W}" height="${H}" fill="${PAPER}"/>
    <rect x="0" y="0" width="${R_W}" height="9" fill="${RED}"/>
    <rect x="10" y="18" width="${R_W - 20}" height="${H - 40}" fill="none" stroke="${INK}" stroke-width="2" opacity="0.35"/>
    ${parts.join('\n')}
    <path d="${tear}" fill="${PAPER}"/>
    <rect x="0" y="${H - 3}" width="${R_W}" height="3" fill="${LINE}"/>
  </svg>`;

  return svgToPng(svg, R_W);
}

// ---------------------------------------------------------------------------
// Page de carte (une categorie)
// ---------------------------------------------------------------------------

interface MenuPageOpts {
  category: string;
  items: { label: string; price: number; fromPrice: boolean; description: string }[];
}

const M_W = 1000;
const M_PAD = 70;
const M_FS = 30;
const M_COLS = Math.floor((M_W - 2 * M_PAD) / charW(M_FS));

export function menuPagePng(o: MenuPageOpts): Buffer {
  const parts: string[] = [];
  let y = 120;

  parts.push(
    `<text x="${M_PAD}" y="76" font-family="IBM Plex Mono" font-size="20" letter-spacing="6" fill="${MUTED}">BON DE COMMANDE</text>`,
  );
  parts.push(
    `<text x="${M_PAD}" y="${y}" font-family="IBM Plex Mono" font-size="56" font-weight="600" fill="${INK}">${xml(
      stripEmoji(o.category).toUpperCase(),
    )}</text>`,
  );
  y += 30;
  parts.push(
    `<line x1="${M_PAD}" y1="${y}" x2="${M_W - M_PAD}" y2="${y}" stroke="${INK}" stroke-width="4"/>`,
  );
  y += 56;

  for (const it of o.items) {
    const price = `${it.fromPrice ? 'dès ' : ''}${it.price} €`;
    parts.push(
      `<text x="${M_PAD}" y="${y}" font-family="IBM Plex Mono" font-size="${M_FS}" font-weight="600" fill="${INK}" xml:space="preserve">${xml(
        leaderRow(clip(it.label, M_COLS - price.length - 2), price, M_COLS),
      )}</text>`,
    );
    y += M_FS + 6;
    if (it.description) {
      for (const line of wrap(it.description, M_COLS - 4)) {
        parts.push(
          `<text x="${M_PAD + 24}" y="${y}" font-family="IBM Plex Mono" font-size="24" font-style="italic" fill="${MUTED}">${xml(
            line,
          )}</text>`,
        );
        y += 30;
      }
    }
    y += 22;
  }

  // bord pointille bas
  y += 6;
  parts.push(
    `<line x1="${M_PAD}" y1="${y}" x2="${M_W - M_PAD}" y2="${y}" stroke="${INK}" stroke-width="3" stroke-dasharray="3 10" opacity="0.5"/>`,
  );
  const H = y + 50;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${M_W}" height="${H}" viewBox="0 0 ${M_W} ${H}">
    <rect width="${M_W}" height="${H}" fill="${PAPER}"/>
    <rect x="0" y="0" width="${M_W}" height="11" fill="${RED}"/>
    <rect x="22" y="26" width="${M_W - 44}" height="${H - 52}" fill="none" stroke="${INK}" stroke-width="2"/>
    <g transform="translate(${M_W - 250} 44) rotate(-4)">
      <rect x="0" y="0" width="200" height="52" rx="6" fill="none" stroke="${RED}" stroke-width="3"/>
      <text x="100" y="34" text-anchor="middle" font-family="IBM Plex Mono" font-size="18" font-weight="600" letter-spacing="3" fill="${RED}">LA CARTE</text>
    </g>
    ${parts.join('\n')}
  </svg>`;

  return svgToPng(svg, M_W);
}

// ---------------------------------------------------------------------------
// Reçu de commande (confirmation)
// ---------------------------------------------------------------------------

export function orderTicketPng(orderId: number, statusText: string, lines: string[]): Buffer {
  const W = 760;
  const parts: string[] = [];
  let y = 300;

  parts.push(
    `<text x="60" y="130" font-family="IBM Plex Mono" font-size="22" letter-spacing="6" fill="${MUTED}">REÇU DE COMMANDE</text>`,
  );
  parts.push(
    `<text x="56" y="${y}" font-family="IBM Plex Mono" font-size="150" font-weight="600" letter-spacing="-4" fill="${INK}">Nº${orderId}</text>`,
  );
  y += 56;
  parts.push(
    `<line x1="60" y1="${y}" x2="${W - 60}" y2="${y}" stroke="${INK}" stroke-width="3" stroke-dasharray="3 10" opacity="0.5"/>`,
  );
  y += 54;
  parts.push(
    `<text x="60" y="${y}" font-family="IBM Plex Mono" font-size="30" font-weight="600" fill="${RED}">${xml(
      statusText.toUpperCase(),
    )}</text>`,
  );
  y += 44;
  for (const l of lines) {
    for (const line of wrap(l, 40)) {
      parts.push(
        `<text x="60" y="${y}" font-family="IBM Plex Mono" font-size="24" fill="${MUTED}">${xml(line)}</text>`,
      );
      y += 32;
    }
  }
  const H = y + 60;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${PAPER}"/>
    <rect x="0" y="0" width="${W}" height="11" fill="${RED}"/>
    <rect x="20" y="24" width="${W - 40}" height="${H - 48}" fill="none" stroke="${INK}" stroke-width="2"/>
    <g transform="translate(${W - 230} 46) rotate(-5)">
      <rect x="0" y="0" width="180" height="56" rx="6" fill="none" stroke="${RED}" stroke-width="4"/>
      <rect x="-4" y="-4" width="188" height="64" rx="8" fill="none" stroke="${RED}" stroke-width="1.5" opacity="0.5"/>
      <text x="90" y="37" text-anchor="middle" font-family="IBM Plex Mono" font-size="22" font-weight="600" letter-spacing="4" fill="${RED}">REÇU</text>
    </g>
    ${parts.join('\n')}
  </svg>`;

  return svgToPng(svg, W);
}
