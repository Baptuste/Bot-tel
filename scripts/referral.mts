/**
 * Module « parrainage » (feuille-de-route Partie 3).
 *
 *   npm run test:referral
 *
 * Client `boutique-demo` (parrainage activé : 5 € filleul / 5 € parrain).
 * Vérifie l'enregistrement d'un filleul, l'application de la réduction à sa
 * première commande, la création du crédit parrain et sa consommation (y compris
 * partielle). In-process, base isolée `data/referral-test.db`.
 */
import { existsSync, rmSync } from 'node:fs';

process.env.CLIENT_ID = 'boutique-demo';
process.env.DB_PATH = 'data/referral-test.db';

for (const suffix of ['', '-wal', '-shm']) {
  const p = `data/referral-test.db${suffix}`;
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
const { createOrder, getOrdersByUser } = await import('../src/orders.ts');
const { upsertCustomer } = await import('../src/customers.ts');
const ref = await import('../src/modules/referral.ts');

const P = 810001; // parrain
const F = 810002; // filleul
const F2 = 810003;

function order(uid: number, cartTotal: number): number {
  const preview = features.referral.enabled ? ref.previewCheckout(uid, cartTotal) : null;
  const total = cartTotal - (preview?.discount ?? 0);
  const id = createOrder({
    userId: uid,
    username: 'x',
    phone: '0600',
    items: [{ catId: 'x', prodId: 'y', label: 'Pain', price: cartTotal, qty: 1 }],
    total,
    referralDiscount: preview && preview.discount > 0 ? preview.discount : null,
  });
  if (preview && preview.discount > 0) ref.commitCheckout(preview);
  return preview?.discount ?? 0;
}

try {
  check('parrainage active (5 / 5)', features.referral.enabled && features.referral.filleulDiscount === 5);
  check('table referrals creee', db.prepare("SELECT name FROM sqlite_master WHERE name='referrals'").get() !== undefined);

  upsertCustomer({ userId: P, username: 'parrain', phone: '0600' });
  upsertCustomer({ userId: F, username: 'filleul', phone: '0600' });
  upsertCustomer({ userId: F2, username: 'filleul2', phone: '0600' });

  const code = ref.codeFor(P);
  check('code reversible', ref.codeFor(P) === code && code.length > 0);

  // --- Enregistrement ---
  check('auto-parrainage refuse', ref.registerFilleul(P, code).ok === false);
  check('code bidon refuse', ref.registerFilleul(F2, 'ZZZZZZ').ok === false);
  check('enregistrement filleul OK', ref.registerFilleul(F, code).ok === true);
  check('deuxieme enregistrement refuse', ref.registerFilleul(F, code).ok === false);

  // --- 1re commande du filleul ---
  const d1 = order(F, 20);
  check('reduction filleul appliquee (-5)', d1 === 5);
  check('  commande filleul a 15 EUR', getOrdersByUser(F)[0]!.total === 15);
  const infoP = ref.referralInfo(P);
  check('  parrain : 1 filleul actif, credit 5 EUR', infoP.filleulsCompleted === 1 && infoP.creditAvailable === 5);

  // 2e commande du filleul : plus de reduction
  check('2e commande filleul : pas de reduction', order(F, 20) === 0);

  // --- Le parrain utilise son credit, en partie ---
  check('parrain paie une commande a 3 EUR -> credit partiel (-3)', order(P, 3) === 3);
  check('  credit restant : 2 EUR', ref.referralInfo(P).creditAvailable === 2);
  check('commande suivante du parrain : -2', order(P, 10) === 2);
  check('  credit epuise', ref.referralInfo(P).creditAvailable === 0);
  check('commande suivante : plus de reduction', order(P, 10) === 0);

  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `data/referral-test.db${suffix}`;
    if (existsSync(p)) rmSync(p);
  }
} catch (err) {
  console.error(err);
  fail++;
}

console.log(`${pass} OK, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
