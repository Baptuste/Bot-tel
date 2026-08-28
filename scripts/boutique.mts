/**
 * Étape 6 du plan « cœur + modules » (docs/coeur-et-modules.md) :
 * valider l'hypothèse sur un client fictif « boutique de vêtements, retrait en
 * magasin, sans tournées » — configuré UNIQUEMENT via `src/features.ts`
 * (entrée `boutique-demo`), sans toucher une ligne de `catalog.ts` /
 * `orderFlow.ts` / `cart.ts`.
 *
 *   npx tsx scripts/boutique.mts
 *
 * Utilise une base isolée (`data/boutique-test.db`), recréée à chaque run. Ne
 * nécessite PAS le bot lancé (test purement in-process).
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

const { features } = await import('../src/features.ts');
const { db } = await import('../src/db.ts');
const catalog = await import('../src/catalog.ts');
const cart = await import('../src/cart.ts');
const { createOrder, getOrder, getStatusCounts } = await import('../src/orders.ts');
const { renderOrderText } = await import('../src/orderFlow.ts');
const { getDashboard } = await import('../src/dashboard.ts');
const { upsertCustomer, getCustomer, getReliability } = await import('../src/customers.ts');

const USER = 990001;

try {
  // --- 1. Config active -------------------------------------------------
  check('features = boutique-demo', features.clientId === 'boutique-demo');
  check('  retrait, pas d\'adresse', features.fulfillment === 'pickup' && !features.requiresAddress);
  check('  pas de tournees / fiabilite', !features.deliverySlots.enabled && !features.reliability.enabled);

  // --- 2. Schema : les tables tournees n'existent pas -----------------
  const routeTables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('routes', 'route_templates')",
    )
    .all() as Array<{ name: string }>;
  check('tables routes / route_templates absentes', routeTables.length === 0);

  // --- 3. Catalogue (coeur inchange) ---------------------------------
  const cat = catalog.createCategory('T-shirts');
  const prod = catalog.createProduct({ category_id: cat.id, name: 'T-shirt uni', price: 0 });
  if (!prod) throw new Error('createProduct a renvoye null');
  catalog.createVariant(prod.id, { label: 'M', price: 19 });
  catalog.createVariant(prod.id, { label: 'L', price: 21 });

  const menu = catalog.reloadMenu();
  const menuItem = menu[String(cat.id)]?.items[String(prod.id)];
  check('getMenu expose le produit + 2 tailles', !!menuItem && menuItem!.variants.length === 2);

  // --- 4. Panier (coeur inchange) ------------------------------------
  const { items, missing } = catalog.resolveMenuItems([
    { catId: String(cat.id), prodId: String(prod.id), variantId: menuItem!.variants[1]!.id, qty: 2 },
  ]);
  check('resolveMenuItems : 1 ligne, prix courant', missing === 0 && items.length === 1 && items[0]!.price === 21);

  for (const l of items) cart.addToCart(USER, l, l.qty);
  const { removed } = cart.reconcileCart(USER);
  check('reconcileCart : rien retire', removed.length === 0);
  check('total panier = 42', cart.cartTotal(USER) === 42);

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

  const dash = getDashboard();
  check('getDashboard : activeRoutes vide, pas de crash', Array.isArray(dash.activeRoutes) && dash.activeRoutes.length === 0);
  check('  commande comptee en pending', (getStatusCounts().pending ?? 0) === 1);

  // getReliability reste appelable meme si le module est off (juste pas affiche)
  check('getReliability : appelable, rate null', getReliability(USER).rate === null);

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
