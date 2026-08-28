/**
 * Test de fumee : verifie l'API (auth + CRUD + flux commande) sans passer par
 * l'interface Telegram. Necessite le bot lance (`npm run dev`).
 *
 *   npx tsx scripts/smoke.mts
 *
 * Cree puis supprime des donnees de test (categorie / produit / variante / tournee /
 * commande). Le flux de statut envoie de VRAIS messages au client de la commande de
 * test (ici l'admin lui-meme).
 */
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createOrder } from '../src/orders.ts';
import { db } from '../src/db.ts';
import { upsertCustomer } from '../src/customers.ts';
import { UPLOADS_DIR } from '../src/uploads.ts';
import { purgeSessions, sqliteSessionStore, SESSION_TTL_MINUTES } from '../src/sessionStore.ts';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const TOKEN = env.BOT_TOKEN!;
const ADMIN_ID = Number(env.ADMIN_IDS!.split(',')[0]);

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

const admin = initData({ id: ADMIN_ID, first_name: 'Smoke' });
const stranger = initData({ id: 1, first_name: 'X' });

async function call(method: string, path: string, body?: unknown, auth = admin) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${auth}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const today = new Date();
const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

async function main() {
  // --- Auth ---
  check('health', (await call('GET', '/api/health')).status === 200);
  check('non-admin -> 403', (await call('GET', '/api/catalog', undefined, stranger)).status === 403);
  check('hash tronque -> 401', (await call('GET', '/api/catalog', undefined, admin + 'x')).status === 401);
  const tampered = new URLSearchParams(admin);
  tampered.set('user', JSON.stringify({ id: ADMIN_ID, first_name: 'HACK' }));
  check('payload trafique -> 401', (await call('GET', '/api/catalog', undefined, tampered.toString())).status === 401);

  // --- Catalogue ---
  const cat = await call('POST', '/api/catalog/categories', { label: 'SMOKE cat' });
  check('POST categorie', cat.status === 201);
  const catId = cat.json.category.id;

  const prod = await call('POST', '/api/catalog/products', {
    category_id: catId,
    name: 'SMOKE produit',
    price: 10,
    description: 'test',
    image: PNG,
  });
  check('POST produit + image', prod.status === 201 && !!prod.json.product.image);
  const prodId = prod.json.product.id;
  const imgFile = prod.json.product.image;
  check('image ecrite sur disque', existsSync(`${UPLOADS_DIR}/${imgFile}`));
  check('image servie', (await fetch(`${BASE}/uploads/${imgFile}`)).status === 200);

  check('POST produit invalide -> 400', (await call('POST', '/api/catalog/products', { category_id: catId, name: '', price: -1 })).status === 400);

  const v = await call('POST', `/api/catalog/products/${prodId}/variants`, { label: 'Maxi', price: 14 });
  check('POST variante', v.status === 201);
  check('PATCH variante prix', (await call('PATCH', `/api/catalog/variants/${v.json.variant.id}`, { price: 15 })).json.variant.price === 15);

  const catalog = await call('GET', '/api/catalog');
  check(
    'GET catalogue coherent',
    catalog.json.products.some((p: any) => p.id === prodId) &&
      catalog.json.variants.some((x: any) => x.product_id === prodId),
  );
  check('DELETE variante', (await call('DELETE', `/api/catalog/variants/${v.json.variant.id}`)).json.ok === true);

  // --- Tournees / modeles ---
  const tpl = await call('POST', '/api/routes/templates', { label: 'SMOKE 23h', time: '23:00' });
  check('POST modele', tpl.status === 201);
  check('PATCH modele inactif', (await call('PATCH', `/api/routes/templates/${tpl.json.template.id}`, { active: false })).json.template.active === false);
  check('POST modele heure invalide -> 400', (await call('POST', '/api/routes/templates', { label: 'x', time: '99:99' })).status === 400);

  const route = await call('POST', '/api/routes', { date: localDate, time_slot: 'SMOKE creneau' });
  check('POST tournee', route.status === 201);
  const routeId = route.json.route.id;

  // --- Flux commande complet (envoie de vrais messages au client) ---
  const order = (u: number) =>
    createOrder({
      userId: u,
      username: 'smoke',
      phone: '06 00 00 00 00',
      address: 'SMOKE — a supprimer',
      total: 10,
      routeId: null,
      items: [{ catId: String(catId), prodId: String(prodId), label: 'SMOKE produit', price: 10, qty: 1 }],
    });

  const SMOKE_USER = 424243;
  upsertCustomer({ userId: SMOKE_USER, username: 'smoke', phone: '0600', address: 'SMOKE', deliveryNote: 'Etage 2, code 99A' });
  const orderId = createOrder({
    userId: SMOKE_USER, username: 'smoke', phone: '0600', address: 'SMOKE', total: 10,
    routeId: null, deliveryNote: 'Etage 2, code 99A',
    items: [{ catId: String(catId), prodId: String(prodId), label: 'SMOKE produit', price: 10, qty: 1 }],
  });
  await call('POST', `/api/routes/${routeId}/assign`, { order_id: orderId });
  check('note de livraison exposee dans le DTO', (await call('GET', `/api/orders/${orderId}`)).json.order.delivery_note === 'Etage 2, code 99A');
  check('position dans la tournee attribuee', (await call('GET', `/api/orders/${orderId}`)).json.order.route_position === 0);

  const order2 = order(SMOKE_USER);
  await call('POST', `/api/routes/${routeId}/assign`, { order_id: order2 });
  check('reorder : move down', (await call('POST', `/api/routes/${routeId}/move`, { order_id: orderId, dir: 'down' })).json.order.route_position === 1);
  check('move dir invalide -> 400', (await call('POST', `/api/routes/${routeId}/move`, { order_id: orderId, dir: 'sideways' })).status === 400);

  check('commande creee (pending)', (await call('GET', `/api/orders/${orderId}`)).json.order.status === 'pending');
  check('commande rattachee a la tournee', (await call('GET', `/api/orders/${orderId}`)).json.order.route?.id === routeId);
  check('DTO commande expose le resume client', typeof (await call('GET', `/api/orders/${orderId}`)).json.order.customer?.reliability?.rate !== 'undefined');
  check('confirm x2', (await call('POST', `/api/orders/${orderId}/status`, { status: 'confirmed' })).json.order.status === 'confirmed' && (await call('POST', `/api/orders/${order2}/status`, { status: 'confirmed' })).json.order.status === 'confirmed');
  check('start tournee -> delivering', (await call('POST', `/api/routes/${routeId}/start`)).status === 200);
  check('  commande en delivering', (await call('GET', `/api/orders/${orderId}`)).json.order.status === 'delivering');
  check('marquer livree (via status) -> markDelivered', (await call('POST', `/api/orders/${order2}/status`, { status: 'delivered' })).json.order.status === 'delivered');
  check('finish tournee -> delivered', (await call('POST', `/api/routes/${routeId}/finish`)).status === 200);
  check('  commande en delivered', (await call('GET', `/api/orders/${orderId}`)).json.order.status === 'delivered');
  check('transition interdite -> 409', (await call('POST', `/api/orders/${orderId}/status`, { status: 'pending' })).status === 409);

  // --- Clients / fiabilite ---
  const o2 = order(SMOKE_USER);
  const cancelRes = await call('POST', `/api/orders/${o2}/status`, {
    status: 'cancelled',
    reason: 'client injoignable',
    no_show: true,
  });
  check('annulation no-show enregistree', cancelRes.json.order.no_show === true && cancelRes.json.order.cancellation_reason === 'client injoignable');

  const cust = await call('GET', `/api/customers/${SMOKE_USER}`);
  check('GET client + fiabilite', cust.status === 200 && cust.json.reliability.delivered === 2 && cust.json.reliability.noShow === 1);
  check('taux 2/(2+1)', Math.abs(cust.json.reliability.rate - 2 / 3) < 0.001);
  check('PATCH client (blocage + note)', (await call('PATCH', `/api/customers/${SMOKE_USER}`, { blocked: true, notes: 'test' })).json.customer.blocked === true);
  check('client apparait dans la liste', (await call('GET', '/api/customers')).json.customers.some((c: any) => c.user_id === SMOKE_USER));
  check('DTO commande signale le blocage', (await call('GET', `/api/orders/${o2}`)).json.order.customer.blocked === true);

  // --- Modification d'une commande (admin) ---
  const editId = order(SMOKE_USER);
  const ed = await call('PATCH', `/api/orders/${editId}`, {
    address: '9 avenue des Tests, Aix',
    delivery_note: '3e etage',
    items: [{ catId: String(catId), prodId: String(prodId), qty: 3 }],
  });
  check('PATCH commande : total recalcule', ed.status === 200 && ed.json.order.total === 30 && ed.json.order.address === '9 avenue des Tests, Aix');
  check('  precision enregistree', ed.json.order.delivery_note === '3e etage');
  check('PATCH articles vides -> 400', (await call('PATCH', `/api/orders/${editId}`, { items: [] })).status === 400);
  check('PATCH produit inconnu -> 400', (await call('PATCH', `/api/orders/${editId}`, { items: [{ catId: '1', prodId: '99999', qty: 1 }] })).status === 400);
  check('PATCH adresse trop courte -> 400', (await call('PATCH', `/api/orders/${editId}`, { address: 'ab' })).status === 400);
  await call('POST', `/api/orders/${editId}/status`, { status: 'confirmed' });
  await call('POST', `/api/orders/${editId}/status`, { status: 'delivering' });
  check('PATCH commande en livraison -> 409', (await call('PATCH', `/api/orders/${editId}`, { address: 'trop tard rue' })).status === 409);

  // --- Modeles de messages ---
  const tplList = await call('GET', '/api/templates');
  check('GET /api/templates (seed)', tplList.status === 200 && tplList.json.templates.length >= 1);
  const mt = await call('POST', '/api/templates', { label: 'SMOKE msg', content: 'bonjour test' });
  check('POST modele message', mt.status === 201);
  check('POST modele vide -> 400', (await call('POST', '/api/templates', { label: '', content: '' })).status === 400);
  check('PATCH modele message', (await call('PATCH', `/api/templates/${mt.json.template.id}`, { content: 'modifie' })).json.template.content === 'modifie');
  check('DELETE modele message', (await call('DELETE', `/api/templates/${mt.json.template.id}`)).json.ok === true);

  // --- Config metier (pilote la Mini App) ---
  const feat = await call('GET', '/api/features');
  check(
    'GET /api/features',
    feat.status === 200 &&
      typeof feat.json.deliverySlots?.enabled === 'boolean' &&
      typeof feat.json.variants?.label === 'string',
  );
  check('  features sans auth -> 401', (await fetch(`${BASE}/api/features`)).status === 401);

  // --- Tableau de bord ---
  const dash = await call('GET', '/api/dashboard');
  check('GET /api/dashboard', dash.status === 200 && typeof dash.json.today?.revenue === 'number' && Array.isArray(dash.json.pending));
  check('  dashboard sans auth -> 401', (await fetch(`${BASE}/api/dashboard`)).status === 401);

  // commande "vieille" -> overdue + alertee
  const oldOrder = order(SMOKE_USER);
  db.prepare("UPDATE orders SET created_at = datetime('now','-45 minutes') WHERE id = ?").run(oldOrder);
  const dash2 = await call('GET', '/api/dashboard');
  const p = dash2.json.pending.find((x: any) => x.id === oldOrder);
  check('commande +45min -> overdue', p?.overdue === true && p.minutes >= 45);

  // --- Sessions persistees (store SQLite, hors API) ---
  const sk = 'smoke:smoke';
  sqliteSessionStore.set(sk, {} as any);
  check('session vide -> pas de ligne', db.prepare('SELECT 1 FROM sessions WHERE key = ?').get(sk) === undefined);
  sqliteSessionStore.set(sk, { __scenes: { current: 'checkout', cursor: 1 } } as any);
  check('scene en cours -> persistee', (sqliteSessionStore.get(sk) as any)?.__scenes?.current === 'checkout');
  db.prepare(`UPDATE sessions SET updated_at = datetime('now','-${SESSION_TTL_MINUTES + 5} minutes') WHERE key = ?`).run(sk);
  check('session expiree -> get undefined', sqliteSessionStore.get(sk) === undefined);
  sqliteSessionStore.set(sk, { __scenes: { current: 'quantity' } } as any);
  db.prepare(`UPDATE sessions SET updated_at = datetime('now','-${SESSION_TTL_MINUTES + 5} minutes') WHERE key = ?`).run(sk);
  check('purge -> supprimee', purgeSessions() >= 1 && db.prepare('SELECT 1 FROM sessions WHERE key = ?').get(sk) === undefined);

  // --- Menage ---
  db.prepare('DELETE FROM orders WHERE user_id = ?').run(SMOKE_USER);
  db.prepare('DELETE FROM customers WHERE user_id = ?').run(SMOKE_USER);
  await call('DELETE', `/api/routes/${routeId}`);
  await call('DELETE', `/api/routes/templates/${tpl.json.template.id}`);
  await call('DELETE', `/api/catalog/categories/${catId}`); // cascade produit + variante
  check('image supprimee avec le produit', !existsSync(`${UPLOADS_DIR}/${imgFile}`));

  console.log(`\n${pass} OK, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
