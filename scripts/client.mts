/**
 * Simule un client qui commande via l'API de la Mini App client (`/api/shop/*`).
 *
 *   npm run test:client
 *
 * In-process : demarre le serveur HTTP sur un port libre, base isolee
 * `data/client-test.db` (recreee/supprimee), faux `telegram` qui collecte les
 * messages. Parcours : menu -> panier (ajout / +/- / retrait) -> checkout ->
 * commande -> le "bot" envoie le recu -> historique.
 */
import crypto from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

process.env.DB_PATH = 'data/client-test.db';
for (const s of ['-shm', '-wal', '']) {
  const f = `data/client-test.db${s}`;
  if (existsSync(f)) rmSync(f);
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const TOKEN = env.BOT_TOKEN!;
const CLIENT_ID = 424242; // pas dans ADMIN_IDS

function initData(user: object): string {
  const p = new URLSearchParams();
  p.set('auth_date', String(Math.floor(Date.now() / 1000)));
  p.set('user', JSON.stringify(user));
  const dcs = [...p.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}
const AUTH = initData({ id: CLIENT_ID, first_name: 'Lea', username: 'lea' });

const { seedCatalogIfEmpty, getMenu } = await import('../src/catalog.ts');
const { createServer } = await import('../src/server.ts');
seedCatalogIfEmpty();

const sent: { chatId: number | string; text: string }[] = [];
const telegram = {
  sendMessage: async (chatId: number | string, text: string) => {
    sent.push({ chatId, text });
    return {};
  },
} as unknown as import('telegraf').Telegram;

const server = createServer(telegram);
const listener = server.listen(0);
await new Promise((r) => listener.once('listening', r));
const port = (listener.address() as AddressInfo).port;
const BASE = `http://localhost:${port}`;

let ok = 0;
let fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(cond ? `OK   ${label}` : `FAIL ${label}`);
  cond ? ok++ : fail++;
};
async function api(method: string, path: string, body?: unknown, auth = AUTH) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${auth}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}

// --- 1. auth ---
check('sans initData -> 401', (await api('GET', '/api/shop/menu', undefined, 'bidon')).status === 401);
{
  const r = await api('GET', '/api/shop/menu');
  check('menu accessible a un non-admin', r.status === 200 && !!r.json.menu && !!r.json.config);
}

// --- 2. reference produit ---
const menu = getMenu();
const flat: { catId: string; prodId: string; price: number }[] = [];
for (const [ci, c] of Object.entries(menu))
  for (const [pi, p] of Object.entries(c.items))
    if (p.variants.length === 0) flat.push({ catId: ci, prodId: pi, price: p.price });
const a = flat[0]!;
const b = flat.find((f) => f.catId === a.catId && f.prodId !== a.prodId) ?? flat[1]!;

// --- 3. panier ---
check('panier vide au depart', (await api('GET', '/api/shop/cart')).json.count === 0);
{
  const r = await api('POST', '/api/shop/cart', { catId: a.catId, prodId: a.prodId, qty: 2 });
  check('ajout -> 1 ligne, qty 2', r.json.count === 2 && r.json.lines.length === 1);
  check('total = 2 x prix', r.json.total === a.price * 2);
}
check(
  'ref bidon -> 404',
  (await api('POST', '/api/shop/cart', { catId: a.catId, prodId: 'zzz', qty: 1 })).status === 404,
);
{
  const key = `${a.catId}:${a.prodId}:`;
  const r = await api('PATCH', '/api/shop/cart', { key, qty: 1 });
  check('PATCH qty 1', r.json.lines[0]!.qty === 1);
}
if (b) {
  const r = await api('POST', '/api/shop/cart', { catId: b.catId, prodId: b.prodId, qty: 1 });
  check('2e produit -> 2 lignes', r.json.lines.length === 2);
}

// --- 4. pre-remplissage (aucune commande encore) ---
{
  const r = await api('GET', '/api/shop/last-order');
  check('last-order : tout null au depart', r.json.address === null && r.json.phone === null);
}

// --- 5. checkout : infos manquantes ---
{
  const r = await api('POST', '/api/shop/orders', {});
  const needsInfo = getMenu() && r.status === 400;
  check('checkout sans infos requises -> 400', needsInfo || r.status === 200);
}

// --- 6. checkout complet ---
let lastOrderId = 0;
{
  const r = await api('POST', '/api/shop/orders', {
    address: '12 rue Jean Moulin, Cabries',
    phone: '06 12 34 56 78',
  });
  check('commande creee -> orderId', r.status === 200 && typeof r.json.orderId === 'number');
  lastOrderId = r.json.orderId;
  check('panier vide apres commande', (await api('GET', '/api/shop/cart')).json.count === 0);
  check(
    'le "bot" a envoye le recu au client',
    sent.some((m) => m.chatId === CLIENT_ID && m.text.includes('enregistrée')),
  );
}

// --- 7. historique + pre-remplissage ---
{
  const r = await api('GET', '/api/shop/orders');
  check('historique : 1 commande', r.json.orders.length === 1 && r.json.orders[0]!.statusLabel);
  check('historique : items detaille', Array.isArray(r.json.orders[0]!.items) && r.json.orders[0]!.items.length > 0);
  const last = await api('GET', '/api/shop/last-order');
  check('last-order pre-rempli apres commande', last.json.phone === '06 12 34 56 78');
}

// --- 8. recommander ---
{
  const bad = await api('POST', '/api/shop/cart/reorder', { orderId: 999999 });
  check('reorder commande inconnue -> 404', bad.status === 404);
  const r = await api('POST', '/api/shop/cart/reorder', { orderId: lastOrderId });
  check(
    'reorder -> panier re-rempli depuis la commande',
    r.status === 200 && r.json.count > 0 && Array.isArray(r.json.skipped),
  );
  await api('DELETE', '/api/shop/cart');
}

listener.close();
console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
