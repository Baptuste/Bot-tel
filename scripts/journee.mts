/**
 * Simulation d'une JOURNEE type de la pizzeria : 20 clients, 3 tournees,
 * 3 livreurs, confirmations / refus / livraisons / no-shows / re-commandes.
 *
 *   npm run test:journee
 *
 * But : verifier de bout en bout que le cycle de vie complet tient la route
 * (commande -> confirmation -> tournee -> livraison -> fiabilite -> tableau de
 * bord) sur un volume realiste. Base isolee (`data/journee-test.db`), recreee a
 * chaque run. Ne necessite PAS le bot lance : un faux `telegram` enregistre les
 * notifications au lieu de les envoyer.
 */
import { existsSync, rmSync } from 'node:fs';
import type { ItemRef } from '../src/catalog.ts';

process.env.CLIENT_ID = 'pizzeria';
process.env.DB_PATH = 'data/journee-test.db';

for (const suffix of ['', '-wal', '-shm']) {
  const p = `data/journee-test.db${suffix}`;
  if (existsSync(p)) rmSync(p);
}

// --- Faux Telegram : on collecte les messages au lieu de les envoyer --------
const sent: Array<{ chatId: number; text: string }> = [];
const telegram = {
  sendMessage: async (chatId: number, text: string) => {
    sent.push({ chatId, text });
  },
} as unknown as import('telegraf').Telegram;

const countText = (needle: string) => sent.filter((m) => m.text.includes(needle)).length;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
  if (ok) pass++;
  else fail++;
}
const log = (s = '') => console.log(s);

// --- Modules metier (charges apres les env vars) ---------------------------
const { db } = await import('../src/db.ts');
const catalog = await import('../src/catalog.ts');
const { createDriver } = await import('../src/drivers.ts');
const { createRoute, assignOrder, moveOrder, startRoute, finishRoute, markDelivered, listRoutes } =
  await import('../src/routes.ts');
const { changeStatus, notifyNewOrder } = await import('../src/orderFlow.ts');
const { createOrder, getOrder, getLastOrder, getStatusCounts, getOrdersByStatus } = await import(
  '../src/orders.ts'
);
const { upsertCustomer, listCustomers } = await import('../src/customers.ts');
const { getReliability } = await import('../src/modules/reliability.ts');
const { getDashboard } = await import('../src/dashboard.ts');

const iso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso();

try {
  // =========================================================================
  // 1. Catalogue du jour
  // =========================================================================
  const pizzas = catalog.createCategory('Pizzas');
  const boissons = catalog.createCategory('Boissons');

  const margherita = catalog.createProduct({ category_id: pizzas.id, name: 'Margherita', price: 0 });
  const reine = catalog.createProduct({ category_id: pizzas.id, name: 'Reine', price: 0 });
  const calzone = catalog.createProduct({ category_id: pizzas.id, name: 'Calzone', price: 14 });
  const coca = catalog.createProduct({ category_id: boissons.id, name: 'Coca 33cl', price: 3 });
  const eau = catalog.createProduct({ category_id: boissons.id, name: 'Eau 50cl', price: 2 });
  if (!margherita || !reine || !calzone || !coca || !eau) throw new Error('catalogue incomplet');

  catalog.createVariant(margherita.id, { label: 'Senior', price: 9 });
  catalog.createVariant(margherita.id, { label: 'Mega', price: 13 });
  catalog.createVariant(reine.id, { label: 'Senior', price: 11 });
  catalog.createVariant(reine.id, { label: 'Mega', price: 15 });

  const menu = catalog.reloadMenu();
  const cat = String(pizzas.id);
  const bcat = String(boissons.id);
  const vId = (prodId: number, label: string) =>
    menu[cat]!.items[String(prodId)]!.variants.find((v) => v.label === label)!.id;

  log('Catalogue : 2 categories, 5 produits (Margherita/Reine en Senior + Mega).');

  // =========================================================================
  // 2. Livreurs + tournees du soir
  // =========================================================================
  const karim = createDriver({ name: 'Karim', phone: '06 11 11 11 11' });
  const sophie = createDriver({ name: 'Sophie', phone: '06 22 22 22 22' });
  const malik = createDriver({ name: 'Malik', phone: '06 33 33 33 33' });

  const r1 = createRoute(TODAY, '18:30', karim.id);
  const r2 = createRoute(TODAY, '19:30', sophie.id);
  const r3 = createRoute(TODAY, '20:30', malik.id);
  log('Livreurs : Karim, Sophie, Malik.  Tournees : 18:30 (Karim) / 19:30 (Sophie) / 20:30 (Malik).');

  // =========================================================================
  // 3. 20 clients passent commande dans la journee
  // =========================================================================
  const NAMES = [
    'Alice', 'Bruno', 'Chloe', 'David', 'Emma', 'Farid', 'Gaelle', 'Hugo', 'Ines', 'Julien',
    'Karim C', 'Lea', 'Marc', 'Nadia', 'Omar', 'Paula', 'Quentin', 'Rachel', 'Sami', 'Tania',
  ];
  const BASE_ID = 700000;

  const combos: ItemRef[][] = [
    [{ catId: cat, prodId: String(margherita.id), variantId: vId(margherita.id, 'Senior'), qty: 1 }],
    [
      { catId: cat, prodId: String(reine.id), variantId: vId(reine.id, 'Mega'), qty: 1 },
      { catId: bcat, prodId: String(coca.id), qty: 2 },
    ],
    [{ catId: cat, prodId: String(calzone.id), qty: 2 }],
    [
      { catId: cat, prodId: String(margherita.id), variantId: vId(margherita.id, 'Mega'), qty: 2 },
      { catId: bcat, prodId: String(eau.id), qty: 1 },
    ],
    [
      { catId: cat, prodId: String(reine.id), variantId: vId(reine.id, 'Senior'), qty: 1 },
      { catId: cat, prodId: String(margherita.id), variantId: vId(margherita.id, 'Senior'), qty: 1 },
    ],
  ];

  function placeOrder(
    uid: number,
    name: string,
    phone: string,
    address: string,
    comboIdx: number,
    note?: string,
  ): number {
    const { items, missing } = catalog.resolveMenuItems(combos[comboIdx]!);
    if (missing > 0) throw new Error(`refs produit introuvables pour ${name}`);
    const total = items.reduce((s, l) => s + l.price * l.qty, 0);
    const id = createOrder({
      userId: uid,
      username: name,
      phone,
      address,
      items,
      total,
      routeId: null,
      deliveryNote: note ?? null,
    });
    upsertCustomer({ userId: uid, username: name, phone, address, deliveryNote: note ?? null });
    const created = getOrder(id);
    if (created) void notifyNewOrder(telegram, created);
    return id;
  }

  interface Sim {
    uid: number;
    name: string;
    phone: string;
    address: string;
    orderId: number;
    route: number;
  }

  const sims: Sim[] = NAMES.map((name, i) => {
    const uid = BASE_ID + i + 1;
    const phone = `06 ${String(10 + i).padStart(2, '0')} 00 00 00`;
    const address = `${i + 1} rue de la Pizza, Aix`;
    const route = [r1.id, r2.id, r3.id][i % 3]!;
    const note = i % 4 === 0 ? `Etage ${1 + (i % 3)}, code ${1000 + i}` : undefined;
    const orderId = placeOrder(uid, name, phone, address, i % combos.length, note);
    return { uid, name, phone, address, orderId, route };
  });
  const byName = (n: string) => sims.find((s) => s.name === n)!;

  log(`\n${sims.length} clients ont commande (notif admin a chaque fois).`);
  check('20 commandes creees, toutes pending', getOrdersByStatus('pending').length === 20);
  check('admin notifie 20 fois', countText('Nouvelle commande #') === 20);

  // =========================================================================
  // 4. Le patron traite les commandes
  // =========================================================================
  const refused = [byName('Farid'), byName('Nadia')]; // rupture / fermeture -> annulation LEGITIME
  const noAnswer = [byName('Julien'), byName('Sami')]; // restent pending

  for (const s of refused) {
    await changeStatus(telegram, s.orderId, 'cancelled', { reason: 'rupture / ferme plus tot', noShow: false });
  }

  let confirmed = 0;
  for (const s of sims) {
    if ([...refused, ...noAnswer].includes(s)) continue;
    await changeStatus(telegram, s.orderId, 'confirmed');
    assignOrder(s.route, s.orderId);
    confirmed++;
  }
  check('16 commandes confirmees + affectees', confirmed === 16);
  check('2 refus = annulation legitime (no_show = 0)', getOrdersByStatus('cancelled').every((o) => o.no_show === false));
  check('16 notifs "confirmée"', countText('est confirmée') === 16);

  // Le patron reordonne 2 arrets dans la tournee de Karim.
  const r1o = listRoutes().find((r) => r.id === r1.id)!.orders;
  if (r1o.length >= 2) {
    moveOrder(r1.id, r1o[r1o.length - 1]!.id, 'up');
    moveOrder(r1.id, r1o[0]!.id, 'down');
  }
  log('Patron : 16 confirmees + affectees, 2 refusees, 2 sans reponse. Ordre tournee 18:30 ajuste.');

  // =========================================================================
  // 5. Les 3 tournees partent (2 no-shows au total)
  // =========================================================================
  async function runRoute(routeId: number, driverName: string, noShowUid: number | null) {
    const before = sent.length;
    await startRoute(telegram, routeId);
    const orders = listRoutes()
      .find((r) => r.id === routeId)!
      .orders.filter((o) => o.status === 'delivering');
    log(`\nTournee ${driverName} : ${orders.length} livraisons.`);
    check(
      `  ${driverName} : ${orders.length} clients informes du livreur`,
      sent.slice(before).filter((m) => m.text.includes(`Ton livreur : ${driverName}`)).length === orders.length,
    );

    for (const o of orders) {
      if (o.user_id === noShowUid) {
        await changeStatus(telegram, o.id, 'cancelled', { reason: 'client absent a la livraison', noShow: true });
        log(`  #${o.id} : SOUCI (client absent) -> no-show`);
      } else {
        await markDelivered(telegram, o.id);
      }
    }
    await finishRoute(telegram, routeId);
    const left = listRoutes()
      .find((r) => r.id === routeId)!
      .orders.filter((o) => o.status === 'delivering');
    check(`  ${driverName} : tournee terminee, rien reste "en livraison"`, left.length === 0);
  }

  await runRoute(r1.id, 'Karim', byName('Gaelle').uid); // 1 no-show
  await runRoute(r2.id, 'Sophie', null); // RAS
  await runRoute(r3.id, 'Malik', byName('Ines').uid); // 1 no-show

  // =========================================================================
  // 6. Re-commandes en fin de service
  // =========================================================================
  const repeats = [byName('Alice'), byName('Chloe'), byName('Hugo')];
  for (const s of repeats) {
    const last = getLastOrder(s.uid);
    check(`re-commande ${s.name} : derniere adresse retrouvee`, last?.address === s.address);
    const id = placeOrder(s.uid, s.name, s.phone, s.address, 1);
    await changeStatus(telegram, id, 'confirmed');
  }
  log(`\n${repeats.length} clients re-commandent (adresse pre-remplie via l'historique).`);

  // =========================================================================
  // 7. Bilan de fin de journee
  // =========================================================================
  const counts = getStatusCounts();
  const delivered = getOrdersByStatus('delivered');
  const revenue = delivered.reduce((s, o) => s + o.total, 0);
  const dash = getDashboard();
  const noShows = listCustomers().filter((c) => getReliability(c.user_id).noShow > 0);
  const label = (c: { name: string | null; username: string | null; user_id: number }) =>
    c.name ?? c.username ?? `#${c.user_id}`;

  log('\n===== BILAN DE LA JOURNEE =====');
  log(`Commandes : ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('  |  ')}`);
  log(`Livrees : ${delivered.length}   CA encaisse : ${revenue} EUR`);
  log(`No-shows : ${noShows.map(label).join(', ') || 'aucun'}`);
  log(`Dashboard "aujourd'hui" : ${dash.today.orders} commandes, ${dash.today.delivered} livrees, ${dash.today.revenue} EUR`);
  for (const r of listRoutes()) {
    const done = r.orders.filter((o) => o.status === 'delivered').length;
    log(`  ${r.time_slot} (${r.driver?.name ?? '-'}) : ${done}/${r.orders.length} livrees - ${r.status}`);
  }
  const tally = new Map<string, number>();
  for (const o of delivered) for (const l of o.items) tally.set(l.label, (tally.get(l.label) ?? 0) + l.qty);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  log(`Top produits livres : ${top.map(([n, qty]) => `${n} x${qty}`).join(', ')}`);
  log('==============================\n');

  // =========================================================================
  // 8. Verifications d'integrite
  // =========================================================================
  const total =
    (counts.pending ?? 0) +
    (counts.confirmed ?? 0) +
    (counts.delivering ?? 0) +
    (counts.delivered ?? 0) +
    (counts.cancelled ?? 0);
  check('total = 23 commandes (20 + 3 re-commandes)', total === 23);
  check('2 encore pending (clients injoignables)', (counts.pending ?? 0) === 2);
  check('0 commande bloquee en "delivering"', (counts.delivering ?? 0) === 0);
  check('14 livrees (16 parties - 2 no-shows)', delivered.length === 14);
  check('4 annulations (2 refus + 2 no-shows)', (counts.cancelled ?? 0) === 4);
  check('3 confirmees non livrees (re-commandes tardives)', (counts.confirmed ?? 0) === 3);

  check('CA dashboard = somme des livrees', dash.today.revenue === revenue);
  check('dashboard : 14 livrees aujourd\'hui', dash.today.delivered === 14);
  check('dashboard : 0 tournee active', dash.activeRoutes.length === 0);

  check('2 no-shows enregistres (Gaelle, Ines)', noShows.length === 2);
  for (const c of noShows) {
    const rel = getReliability(c.user_id);
    check(`  ${label(c)} : no-show compte, taux < 1`, rel.noShow >= 1 && (rel.rate === null || rel.rate < 1));
  }
  const alice = getReliability(byName('Alice').uid);
  check('Alice : 1 livree, 0 no-show, taux 100%', alice.delivered === 1 && alice.noShow === 0 && alice.rate === 1);

  check('14 notifs "a été livrée"', countText('a été livrée') === 14);
  check('16 notifs "Ton livreur : <nom>"', countText('Ton livreur : ') === 16);
  check('2 notifs d\'annulation (no-shows)', countText('a été annulée') === 2);

  // --- Nettoyage ---
  catalog.deleteCategory(pizzas.id);
  catalog.deleteCategory(boissons.id);
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `data/journee-test.db${suffix}`;
    if (existsSync(p)) rmSync(p);
  }
} catch (err) {
  console.error(err);
  fail++;
}

console.log(`${pass} OK, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
