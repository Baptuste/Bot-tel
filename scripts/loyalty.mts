/**
 * Module « programme de fidélité » (feuille-de-route Partie 3).
 *
 *   npm run test:loyalty
 *
 * Client `boutique-demo` (fidélité activée : 1 point / commande, palier 10).
 * Vérifie que les points sont crédités quand une commande est servie, que le
 * palier déclenche une notification, et que l'admin peut appliquer la récompense.
 * In-process, base isolée `data/loyalty-test.db`.
 */
import { existsSync, rmSync } from 'node:fs';

process.env.CLIENT_ID = 'boutique-demo';
process.env.DB_PATH = 'data/loyalty-test.db';

for (const suffix of ['', '-wal', '-shm']) {
  const p = `data/loyalty-test.db${suffix}`;
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
const { createOrder } = await import('../src/orders.ts');
const { changeStatus } = await import('../src/orderFlow.ts');
const loyalty = await import('../src/modules/loyalty.ts');

const USER = 800001;
const newOrder = () =>
  createOrder({
    userId: USER,
    username: 'fidele',
    phone: '0600',
    items: [{ catId: 'x', prodId: 'y', label: 'Pain', price: 2, qty: 1 }],
    total: 2,
  });

try {
  check('fidelite activee (palier 10)', features.loyalty.enabled && features.loyalty.rewardThreshold === 10);
  check('table loyalty creee', db.prepare("SELECT name FROM sqlite_master WHERE name='loyalty'").get() !== undefined);
  check('solde initial = 0', loyalty.getPoints(USER) === 0);

  // Une commande menee jusqu'a "collected" (role fulfilled) via changeStatus.
  const first = newOrder();
  await changeStatus(telegram, first, 'confirmed');
  await changeStatus(telegram, first, 'ready');
  await changeStatus(telegram, first, 'collected');
  check('1 commande servie -> 1 point', loyalty.getPoints(USER) === 1);
  check('  pas encore de recompense', loyalty.loyaltyStatus(USER).rewardsAvailable === 0);
  check('  9 points avant la recompense', loyalty.loyaltyStatus(USER).toNextReward === 9);

  // 8 commandes de plus, servies directement.
  for (let i = 0; i < 8; i++) {
    const o = newOrder();
    await changeStatus(telegram, o, 'confirmed');
    await changeStatus(telegram, o, 'ready');
    await changeStatus(telegram, o, 'collected');
  }
  check('9 points au total', loyalty.getPoints(USER) === 9);

  // La 10e franchit le palier -> notification client.
  sent.length = 0;
  const tenth = newOrder();
  await changeStatus(telegram, tenth, 'confirmed');
  await changeStatus(telegram, tenth, 'ready');
  await changeStatus(telegram, tenth, 'collected');
  check('10 points -> 1 recompense disponible', loyalty.loyaltyStatus(USER).rewardsAvailable === 1);
  check(
    '  le client est notifie du palier',
    sent.some((m) => m.chatId === USER && m.text.includes('debloque') && m.text.includes('viennoiserie')),
  );

  // L'admin applique la recompense.
  check('redeemReward -> true', loyalty.redeemReward(USER) === true);
  check('  solde retombe a 0', loyalty.getPoints(USER) === 0);
  check('  plus de recompense dispo', loyalty.loyaltyStatus(USER).rewardsAvailable === 0);
  check('redeemReward sans points -> false', loyalty.redeemReward(USER) === false);

  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `data/loyalty-test.db${suffix}`;
    if (existsSync(p)) rmSync(p);
  }
} catch (err) {
  console.error(err);
  fail++;
}

console.log(`${pass} OK, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
