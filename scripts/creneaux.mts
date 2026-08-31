/**
 * Module « créneaux à capacité limitée » (feuille-de-route Partie 3).
 *
 *   npm run test:creneaux
 *
 * Vérifie qu'un créneau plein disparaît des choix proposés au client, que le
 * nombre de places restantes est correct, et que la capacité par défaut
 * (`features.deliverySlots.capacityLimit`) s'applique aux créneaux sans capacité
 * propre. In-process, base isolée `data/creneaux-test.db`.
 */
import { existsSync, rmSync } from 'node:fs';

process.env.CLIENT_ID = 'pizzeria';
process.env.DB_PATH = 'data/creneaux-test.db';

for (const suffix of ['', '-wal', '-shm']) {
  const p = `data/creneaux-test.db${suffix}`;
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
const routes = await import('../src/routes.ts');
const { createOrder } = await import('../src/orders.ts');

// Un moment fixe : demain 10:00 (les créneaux du soir sont donc bien dans le futur).
const now = new Date();
now.setDate(now.getDate() + 1);
now.setHours(10, 0, 0, 0);
const tomorrow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

function order(routeId: number): number {
  return createOrder({
    userId: 500001,
    username: 'creneaux',
    phone: '0600',
    address: 'test',
    items: [{ catId: 'x', prodId: 'y', label: 'Pizza', price: 10, qty: 1 }],
    total: 10,
    routeId,
  });
}

try {
  // --- 1. Capacité propre au créneau ----------------------------------
  routes.createTemplate({ label: 'Midi', time: '18:00', max_capacity: 2 });
  routes.ensureRoutesForDate(tomorrow);
  const route = routes.listRoutes().find((r) => r.slot_time === '18:00' && r.date === tomorrow)!;

  let slots = routes.getAvailableSlots(now);
  const s0 = slots.find((s) => s.routeId === route.id);
  check('creneau propose, 2 places restantes', s0?.remaining === 2);

  order(route.id);
  slots = routes.getAvailableSlots(now);
  check('1 commande -> 1 place restante', slots.find((s) => s.routeId === route.id)?.remaining === 1);

  order(route.id);
  slots = routes.getAvailableSlots(now);
  check('creneau plein -> retire des choix', !slots.some((s) => s.routeId === route.id));
  check('mais hasUpcomingSlots() reste vrai (le creneau existe)', routes.hasUpcomingSlots(now) === true);

  // --- 2. Capacité par défaut du client -----------------------------
  routes.createTemplate({ label: 'Soir', time: '20:00' }); // pas de max_capacity propre
  routes.ensureRoutesForDate(tomorrow);
  const soir = routes.listRoutes().find((r) => r.slot_time === '20:00' && r.date === tomorrow)!;

  check(
    'sans defaut : creneau illimite (remaining null)',
    routes.getAvailableSlots(now).find((s) => s.routeId === soir.id)?.remaining === null,
  );

  features.deliverySlots.capacityLimit = 1; // simule un client qui plafonne ses creneaux
  check(
    'avec defaut 1 : 1 place restante',
    routes.getAvailableSlots(now).find((s) => s.routeId === soir.id)?.remaining === 1,
  );
  order(soir.id);
  check(
    'avec defaut 1 : plein apres 1 commande',
    !routes.getAvailableSlots(now).some((s) => s.routeId === soir.id),
  );
  features.deliverySlots.capacityLimit = null;

  // --- Nettoyage ---
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `data/creneaux-test.db${suffix}`;
    if (existsSync(p)) rmSync(p);
  }
} catch (err) {
  console.error(err);
  fail++;
}

console.log(`${pass} OK, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
