/**
 * Client fictif `boutique-demo` : commerce de proximité, RETRAIT en magasin,
 * aucun module optionnel actif, machine à états `pending → confirmed → ready →
 * collected` (pas d'étape « en livraison »). Tout est configuré via
 * `src/features.ts` — le cœur (`catalog.ts` / `cart.ts` / `orderFlow.ts`) n'est
 * pas touché.
 *
 *   npm run test:boutique
 *
 * Base isolée (`data/boutique-test.db`), recréée à chaque run. In-process : un
 * faux `telegram` collecte les notifications au lieu de les envoyer.
 */
import { existsSync, rmSync } from 'node:fs';

// La config et le chemin de base doivent être posés AVANT tout import métier :
// les modules ci-dessous sont donc chargés dynamiquement.
process.env.CLIENT_ID = 'boutique-demo';
process.env.DB_PATH = 'data/boutique-test.db';

for (const suffix of ['', '-wal', '-shm']) {
  const p = `data/boutique-test.db${suffix}`;
  if (existsSync(p)) rmSync(p);
}

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
  if (ok) pass++;
  else fail++;
}

const sent: Array<{ chatId: number; text: string }> = [];
const telegram = {
  sendMessage: async (chatId: number, text: string) => {
    sent.push({ chatId, text });
  },
} as unknown as import('telegraf').Telegram;

const { features } = await import('../src/features.ts');
const { db } = await import('../src/db.ts');
const catalog = await import('../src/catalog.ts');
const cart = await import('../src/cart.ts');
const { createOrder, getOrder, getStatusCounts, updateOrderStatus } = await import('../src/orders.ts');
const { renderOrderText, nextStatuses, changeStatus } = await import('../src/orderFlow.ts');
const { orderStages, validateOrderFlow } = await import('../src/orderStages.ts');
const { getDashboard } = await import('../src/dashboard.ts');
const { upsertCustomer, getCustomer } = await import('../src/customers.ts');
const { getReliability } = await import('../src/modules/reliability.ts');

const USER = 990001;

try {
  // --- 1. Config active -------------------------------------------------
  check('features = boutique-demo', features.clientId === 'boutique-demo');
  check('  retrait, pas d\'adresse', features.fulfillment === 'pickup' && !features.requiresAddress);
  check(
    '  tournees / fiabilite / messages / variantes tous off',
    !features.deliverySlots.enabled &&
      !features.reliability.enabled &&
      !features.messaging.templatesEnabled &&
      !features.variants.enabled,
  );
  check(
    '  machine a etats retrait : pending -> confirmed -> ready -> collected',
    orderStages().map((s) => s.id).join(' ') === 'pending confirmed ready collected cancelled',
  );
  check('  aucune etape "delivering"', !orderStages().some((s) => s.id === 'delivering'));

  // --- 2. Schema : les tables des modules desactives n'existent pas ---
  const absentTables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('routes', 'route_templates', 'drivers', 'message_templates')",
    )
    .all() as Array<{ name: string }>;
  check('tables routes / route_templates / drivers / message_templates absentes', absentTables.length === 0);

  // --- 3. Catalogue : variantes en base MAIS masquees (variants.enabled off) ---
  const cat = catalog.createCategory('Pains');
  const prod = catalog.createProduct({ category_id: cat.id, name: 'Baguette tradition', price: 15 });
  if (!prod) throw new Error('createProduct a renvoye null');
  // On cree quand meme des variantes en base : le module etant off, elles ne
  // doivent pas apparaitre cote client.
  catalog.createVariant(prod.id, { label: 'M', price: 19 });
  catalog.createVariant(prod.id, { label: 'L', price: 21 });

  const menu = catalog.reloadMenu();
  const menuItem = menu[String(cat.id)]?.items[String(prod.id)];
  check(
    'getMenu : variantes masquees, produit traite comme simple (prix de base)',
    !!menuItem && menuItem!.variants.length === 0 && menuItem!.price === 15,
  );
  check(
    'listCatalog (editeur admin) : les variantes restent visibles',
    catalog.listCatalog().variants.filter((v) => v.product_id === prod.id).length === 2,
  );

  // --- 4. Panier (coeur inchange) ------------------------------------
  const { items, missing } = catalog.resolveMenuItems([
    { catId: String(cat.id), prodId: String(prod.id), qty: 2 },
  ]);
  check('resolveMenuItems : 1 ligne au prix de base', missing === 0 && items.length === 1 && items[0]!.price === 15);

  for (const l of items) cart.addToCart(USER, l, l.qty);
  const { removed } = cart.reconcileCart(USER);
  check('reconcileCart : rien retire', removed.length === 0);
  check('total panier = 30', cart.cartTotal(USER) === 30);

  // --- 5. Checkout « retrait » : ni adresse ni creneau -------------
  const orderId = createOrder({
    userId: USER,
    username: 'boutiquetest',
    phone: '06 11 22 33 44',
    items: cart.getCart(USER),
    total: cart.cartTotal(USER),
    // pas d'address, pas de routeId, pas de deliveryNote
  });
  cart.clearCart(USER);
  upsertCustomer({ userId: USER, username: 'boutiquetest', phone: '06 11 22 33 44' });

  const order = getOrder(orderId);
  check('commande creee sans adresse', !!order && order!.address === null && order!.phone === '06 11 22 33 44');
  check('fiche client creee (adresse null)', getCustomer(USER)?.address === null);

  // --- 6. Rendu / dashboard : pas de crash cote livraison --------
  const text = order ? renderOrderText(order) : '';
  check('renderOrderText : "Retrait en boutique", pas de ligne Adresse', text.includes('Retrait en boutique') && !text.includes('Adresse :'));

  const { contactView } = await import('../src/views.ts');
  const contact = contactView().text;
  check('contactView : affiche le telephone de la boutique', contact.includes(features.contact.phone!) && contact.includes(features.displayName));

  // --- 6c. Relais de messagerie client <-> admin ---
  {
    const { config } = await import('../src/config.ts');
    const { relayClientMessage, relayAdminReply } = await import('../src/support.ts');
    const admin = config.adminIds[0]!;
    await relayClientMessage(telegram, { id: USER, username: 'lea' }, 'ma commande est en retard');
    check(
      'message client transmis a l\'admin',
      sent.some((m) => m.chatId === admin && m.text.includes('ma commande est en retard')),
    );
    await relayAdminReply(telegram, USER, 'on regarde ca tout de suite');
    check(
      'reponse admin transmise au client',
      sent.some((m) => m.chatId === USER && m.text.includes('on regarde ca tout de suite')),
    );
  }

  const dash = getDashboard();
  check('getDashboard : activeRoutes vide, pas de crash', Array.isArray(dash.activeRoutes) && dash.activeRoutes.length === 0);
  check('  commande comptee en pending', (getStatusCounts().pending ?? 0) === 1);

  // getReliability reste appelable meme si le module est off (juste pas affiche)
  check('getReliability : appelable, rate null', getReliability(USER).rate === null);

  // Module fiabilite OFF : meme avec un no-show au compteur, `renderOrderText`
  // (via customerFlag) n'ajoute jamais la ligne "Fiabilite".
  updateOrderStatus(orderId, 'cancelled', { noShow: true });
  const order3 = createOrder({
    userId: USER,
    username: 'boutiquetest',
    phone: '06 11 22 33 44',
    items,
    total: 21,
  });
  const text3 = renderOrderText(getOrder(order3)!);
  check('reliability OFF : pas de ligne "Fiabilite" dans le rendu commande', !/[Ff]iabilit/.test(text3));

  // --- 6b. Transitions derivees de features.orderFlow ---
  const seq = (id: string) => nextStatuses(id).map((s) => `${s.to}:${s.label}`).join(' | ');
  check('nextStatuses(pending)', seq('pending') === 'confirmed:✅ Confirmer | cancelled:❌ Refuser');
  check('nextStatuses(confirmed)', seq('confirmed') === 'ready:📦 Prête | cancelled:❌ Annuler');
  check('nextStatuses(ready)', seq('ready') === 'collected:✅ Retirée | cancelled:❌ Souci');
  check('nextStatuses(collected) = [] (terminal)', nextStatuses('collected').length === 0);
  let badThrew = false;
  try {
    validateOrderFlow({ stages: [{ id: 'x', role: 'placed', label: 'x' }] });
  } catch {
    badThrew = true;
  }
  check('validateOrderFlow rejette une config incomplete', badThrew);

  // --- 6c. Cycle de vie complet d'une commande RETRAIT ---
  const life = createOrder({ userId: USER, username: 'boutiquetest', phone: '0600', items, total: 30 });
  check('commande creee au statut initial "pending"', getOrder(life)!.status === 'pending');
  await changeStatus(telegram, life, 'confirmed');
  await changeStatus(telegram, life, 'ready');
  const done = await changeStatus(telegram, life, 'collected');
  check('cycle pending -> confirmed -> ready -> collected', done?.status === 'collected');
  check('  horodatage de completion pose (role fulfilled)', getOrder(life)!.delivered_at !== null);
  const msgs = sent.filter((m) => m.chatId === USER && m.text.includes(`#${life}`)).map((m) => m.text);
  check(
    '  le client a recu "confirmée", "prête", "retirée"',
    msgs.some((t) => t.includes('— confirmée')) &&
      msgs.some((t) => t.includes('— prête')) &&
      msgs.some((t) => t.includes('— retirée')),
  );
  check(
    '  "collected" compte comme une commande servie (dashboard + fiabilite)',
    getDashboard().today.delivered >= 1,
  );

  // --- 7. Le module tournees est importable mais inerte ----------
  const routes = await import('../src/routes.ts');
  let threw = false;
  try {
    routes.getAvailableSlots();
  } catch {
    threw = true;
  }
  check('routes.ts importe OK mais getAvailableSlots() echoue (tables absentes)', threw);

  // --- Nettoyage -----------------------------------------------------
  catalog.deleteCategory(cat.id);
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `data/boutique-test.db${suffix}`;
    if (existsSync(p)) rmSync(p);
  }
} catch (err) {
  console.error(err);
  fail++;
}

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
