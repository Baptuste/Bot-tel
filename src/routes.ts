/**
 * Tournees de livraison (table `routes`) + modeles recurrents (`route_templates`).
 *
 * Cycle de vie d'une tournee : planned -> started -> done.
 *  - `startRoute()`  : commandes `confirmed` -> `delivering` (chaque client notifie).
 *  - `finishRoute()` : commandes `delivering` restantes -> `delivered`.
 *
 * Modeles : creneaux recurrents (ex 15:00 / 18:00 / 21:00). `ensureRoutesForDate()`
 * materialise les tournees d'une date a partir des modeles actifs (idempotent).
 * Le client choisit son creneau au checkout via `getAvailableSlots()`.
 *
 * NB fuseau horaire : on raisonne en heure LOCALE du serveur (= celle de la boutique).
 */
import type { Telegram } from 'telegraf';
import { db } from './db';
import { driverExists, getDriver, type Driver } from './drivers';
import { features } from './features';
import { changeStatus, safeSend } from './orderFlow';
import { requireRole } from './orderStages';
import {
  detachRouteOrders,
  getAssignableOrders,
  getOrder,
  getOrdersByRoute,
  moveOrderInRoute,
  setOrderRoute,
  type Order,
} from './orders';

export type RouteStatus = 'planned' | 'started' | 'done';

export interface Route {
  id: number;
  date: string;
  time_slot: string;
  slot_time: string | null;
  template_id: number | null;
  max_capacity: number | null;
  driver_id: number | null;
  status: RouteStatus;
  created_at: string;
}

export interface RouteWithOrders extends Route {
  orders: Order[];
  driver: Pick<Driver, 'id' | 'name'> | null;
}

export interface RouteTemplate {
  id: number;
  label: string;
  time: string;
  max_capacity: number | null;
  driver_id: number | null;
  active: boolean;
  position: number;
}

interface TemplateRow extends Omit<RouteTemplate, 'active'> {
  active: number;
}

/** On n'affiche plus un creneau au client s'il est a moins de X minutes. */
const SLOT_LEAD_MINUTES = 30;

// --- Requetes preparees (a la demande) -----------------------------------
// Preparees au premier appel seulement : ce module peut etre importe meme
// quand les tables `routes` / `route_templates` n'existent pas (client sans
// livraison, cf. features.deliverySlots.enabled), tant qu'aucune fonction
// exportee n'est appelee. Le montage de `/api/routes` et l'usage cote bot
// sont deja conditionnes par la config.

function buildStatements() {
  return {
    insert: db.prepare<[string, string, number | null]>(
      'INSERT INTO routes (date, time_slot, driver_id) VALUES (?, ?, ?)',
    ),
    insertFromTemplate: db.prepare<{
      date: string;
      time_slot: string;
      slot_time: string;
      template_id: number;
      max_capacity: number | null;
      driver_id: number | null;
    }>(`
      INSERT INTO routes (date, time_slot, slot_time, template_id, max_capacity, driver_id)
      VALUES (@date, @time_slot, @slot_time, @template_id, @max_capacity, @driver_id)
    `),
    get: db.prepare<[number]>('SELECT * FROM routes WHERE id = ?'),
    setDriver: db.prepare<[number | null, number]>('UPDATE routes SET driver_id = ? WHERE id = ?'),
    list: db.prepare(
      "SELECT * FROM routes ORDER BY CASE status WHEN 'started' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, date, slot_time, id",
    ),
    existsForTemplate: db.prepare<[string, number]>(
      'SELECT id FROM routes WHERE date = ? AND template_id = ?',
    ),
    setStatus: db.prepare<[string, number]>('UPDATE routes SET status = ? WHERE id = ?'),
    remove: db.prepare<[number]>('DELETE FROM routes WHERE id = ?'),

    templates: db.prepare('SELECT * FROM route_templates ORDER BY position, time'),
    activeTemplates: db.prepare(
      'SELECT * FROM route_templates WHERE active = 1 ORDER BY position, time',
    ),
    getTemplate: db.prepare<[number]>('SELECT * FROM route_templates WHERE id = ?'),
    insertTemplate: db.prepare<{
      label: string;
      time: string;
      max_capacity: number | null;
      driver_id: number | null;
      position: number;
    }>(
      'INSERT INTO route_templates (label, time, max_capacity, driver_id, position) VALUES (@label, @time, @max_capacity, @driver_id, @position)',
    ),
    updateTemplate: db.prepare<{
      id: number;
      label: string;
      time: string;
      max_capacity: number | null;
      driver_id: number | null;
      active: number;
      position: number;
    }>(`
      UPDATE route_templates
      SET label = @label, time = @time, max_capacity = @max_capacity, driver_id = @driver_id,
          active = @active, position = @position
      WHERE id = @id
    `),
    deleteTemplate: db.prepare<[number]>('DELETE FROM route_templates WHERE id = ?'),
    countTemplates: db.prepare('SELECT COUNT(*) AS n FROM route_templates'),
  };
}

let _statements: ReturnType<typeof buildStatements> | undefined;

function q(): ReturnType<typeof buildStatements> {
  if (!_statements) _statements = buildStatements();
  return _statements;
}

// --- Helpers date (heure locale) ---------------------------------------

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toTemplate(row: TemplateRow): RouteTemplate {
  return { ...row, active: row.active === 1 };
}

function withOrders(route: Route): RouteWithOrders {
  const driver = route.driver_id ? getDriver(route.driver_id) : null;
  return {
    ...route,
    orders: getOrdersByRoute(route.id),
    driver: driver ? { id: driver.id, name: driver.name } : null,
  };
}

// --- Modeles de tournees ----------------------------------------------

/** Cree 3 creneaux par defaut (15:00 / 18:00 / 21:00) si aucun modele n'existe. */
export function seedDefaultTemplatesIfEmpty(): void {
  if ((q().countTemplates.get() as { n: number }).n > 0) return;
  ['15:00', '18:00', '21:00'].forEach((time, i) => {
    q().insertTemplate.run({ label: time, time, max_capacity: null, driver_id: null, position: i });
  });
  console.log('[routes] 3 modeles de tournees par defaut crees (15:00 / 18:00 / 21:00).');
}

export function listTemplates(): RouteTemplate[] {
  return (q().templates.all() as TemplateRow[]).map(toTemplate);
}

export function createTemplate(input: {
  label: string;
  time: string;
  max_capacity?: number | null;
  driver_id?: number | null;
}): RouteTemplate {
  const position = (q().templates.all() as TemplateRow[]).length;
  const id = Number(
    q().insertTemplate.run({
      label: input.label,
      time: input.time,
      max_capacity: input.max_capacity ?? null,
      driver_id: input.driver_id ?? null,
      position,
    }).lastInsertRowid,
  );
  return toTemplate(q().getTemplate.get(id) as TemplateRow);
}

export function updateTemplate(
  id: number,
  patch: Partial<Omit<RouteTemplate, 'id'>>,
): RouteTemplate | null {
  const current = q().getTemplate.get(id) as TemplateRow | undefined;
  if (!current) return null;
  q().updateTemplate.run({
    id,
    label: patch.label ?? current.label,
    time: patch.time ?? current.time,
    max_capacity:
      patch.max_capacity === undefined ? current.max_capacity : patch.max_capacity,
    driver_id: patch.driver_id === undefined ? current.driver_id : patch.driver_id,
    active: patch.active === undefined ? current.active : patch.active ? 1 : 0,
    position: patch.position ?? current.position,
  });
  return toTemplate(q().getTemplate.get(id) as TemplateRow);
}

export function deleteTemplate(id: number): boolean {
  return q().deleteTemplate.run(id).changes > 0;
}

// --- Materialisation ---------------------------------------------------

/** Cree les tournees manquantes de `date` a partir des modeles actifs (idempotent). */
export function ensureRoutesForDate(date: string): void {
  for (const t of q().activeTemplates.all() as TemplateRow[]) {
    if (q().existsForTemplate.get(date, t.id)) continue;
    q().insertFromTemplate.run({
      date,
      time_slot: t.label,
      slot_time: t.time,
      template_id: t.id,
      max_capacity: t.max_capacity,
      driver_id: t.driver_id,
    });
  }
}

/** Materialise aujourd'hui + demain (appele par le planificateur et au besoin). */
export function ensureUpcomingRoutes(now = new Date()): void {
  ensureRoutesForDate(localISODate(now));
  ensureRoutesForDate(localISODate(new Date(now.getTime() + 86_400_000)));
}

// --- Tournees --------------------------------------------------------

export function createRoute(date: string, timeSlot: string, driverId: number | null = null): Route {
  const driver = driverId != null && driverExists(driverId) ? driverId : null;
  const id = Number(q().insert.run(date, timeSlot, driver).lastInsertRowid);
  return q().get.get(id) as Route;
}

export function getRoute(id: number): Route | null {
  return (q().get.get(id) as Route | undefined) ?? null;
}

/** Affecte / retire (null) un livreur a une tournee. Renvoie la tournee a jour. */
export function setRouteDriver(routeId: number, driverId: number | null): RouteWithOrders | null {
  const route = getRoute(routeId);
  if (!route) return null;
  if (driverId != null && !driverExists(driverId)) return null;
  q().setDriver.run(driverId, routeId);
  return withOrders(getRoute(routeId) as Route);
}

export function listRoutes(): RouteWithOrders[] {
  return (q().list.all() as Route[]).map(withOrders);
}

/** Etat complet pour la Mini App : modeles + tournees + commandes affectables. */
export function routesOverview(): {
  templates: RouteTemplate[];
  routes: RouteWithOrders[];
  assignable: Order[];
} {
  ensureUpcomingRoutes();
  return { templates: listTemplates(), routes: listRoutes(), assignable: getAssignableOrders() };
}

export function assignOrder(routeId: number, orderId: number): Order | null {
  if (!getRoute(routeId) || !getOrder(orderId)) return null;
  return setOrderRoute(orderId, routeId);
}

export function unassignOrder(orderId: number): Order | null {
  if (!getOrder(orderId)) return null;
  return setOrderRoute(orderId, null);
}

export function deleteRoute(id: number): boolean {
  if (!getRoute(id)) return false;
  detachRouteOrders(id);
  q().remove.run(id);
  return true;
}

export async function startRoute(telegram: Telegram, id: number): Promise<RouteWithOrders | null> {
  const route = getRoute(id);
  if (!route || route.status !== 'planned') return route ? withOrders(route) : null;

  q().setStatus.run('started', id);
  const driver = route.driver_id ? getDriver(route.driver_id) : null;
  const acceptedId = requireRole('accepted').id;
  const fulfillingId = requireRole('fulfilling').id;
  for (const order of getOrdersByRoute(id)) {
    if (order.status === acceptedId) {
      await changeStatus(telegram, order.id, fulfillingId);
      if (driver) {
        await safeSend(telegram, order.user_id, `🛵 Ton livreur : ${driver.name}.`, undefined, {
          alertAdmins: true,
          context: `commande #${order.id} · livreur`,
        });
      }
    }
  }
  await notifyRouteProgress(telegram, id); // les premiers de la file connaissent leur position
  return withOrders(getRoute(id) as Route);
}

export async function finishRoute(telegram: Telegram, id: number): Promise<RouteWithOrders | null> {
  const route = getRoute(id);
  if (!route || route.status !== 'started') return route ? withOrders(route) : null;

  q().setStatus.run('done', id);
  const fulfillingId = requireRole('fulfilling').id;
  const fulfilledId = requireRole('fulfilled').id;
  for (const order of getOrdersByRoute(id)) {
    if (order.status === fulfillingId) {
      await changeStatus(telegram, order.id, fulfilledId);
    }
  }
  return withOrders(getRoute(id) as Route);
}

// --- Suivi de tournee en direct ------------------------------------

/**
 * Notifie les clients encore en attente de leur position dans la tournee.
 * On ne previent que les 3 prochains (pas de spam sur une longue tournee).
 */
export async function notifyRouteProgress(telegram: Telegram, routeId: number): Promise<void> {
  const fulfillingId = requireRole('fulfilling').id;
  const remaining = getOrdersByRoute(routeId).filter((o) => o.status === fulfillingId);
  for (let i = 0; i < remaining.length && i < 3; i++) {
    const o = remaining[i]!;
    const tail =
      i === 0
        ? 'tu es le prochain arrêt ! Prépare-toi à la réceptionner.'
        : i === 1
          ? "plus qu'un arrêt avant toi."
          : 'encore 2 arrêts avant toi.';
    await safeSend(
      telegram,
      o.user_id,
      `🛵 <b>Commande #${o.id}</b> — ${tail}`,
      { parse_mode: 'HTML' },
      { alertAdmins: true, context: `commande #${o.id} · suivi tournée` },
    );
  }
}

/** Marque une commande à son étape finale ET fait avancer le suivi de la tournée. */
export async function markDelivered(telegram: Telegram, orderId: number): Promise<Order | null> {
  const updated = await changeStatus(telegram, orderId, requireRole('fulfilled').id);
  if (updated?.route_id) {
    await notifyRouteProgress(telegram, updated.route_id);
  }
  return updated;
}

/** Deplace une commande dans l'ordre de livraison de sa tournee. */
export function moveOrder(routeId: number, orderId: number, dir: 'up' | 'down'): Order | null {
  const order = getOrder(orderId);
  if (!order || order.route_id !== routeId) return null;
  moveOrderInRoute(orderId, dir);
  return getOrder(orderId);
}

// --- Creneaux proposes au client -------------------------------------

export interface Slot {
  routeId: number;
  date: string;
  time: string;
  label: string;
  when: 'today' | 'tomorrow';
  /** Places restantes dans le créneau, ou null si capacité illimitée. */
  remaining: number | null;
}

/** Capacité effective d'une tournée : la sienne, sinon le défaut du client. */
function slotCapacity(route: Route): number | null {
  return route.max_capacity ?? features.deliverySlots.capacityLimit;
}

/** Tournée `planned`, aujourd'hui/demain, pas trop proche : candidate à un créneau. */
function isSlotCandidate(route: Route, now: Date, todayISO: string, tomorrowISO: string): boolean {
  if (route.status !== 'planned' || !route.slot_time) return false;
  if (route.date !== todayISO && route.date !== tomorrowISO) return false;
  const dt = new Date(`${route.date}T${route.slot_time}:00`);
  return dt.getTime() - now.getTime() >= SLOT_LEAD_MINUTES * 60_000;
}

/** Creneaux reservables : tournee `planned`, pas passee, pas pleine. */
export function getAvailableSlots(now = new Date()): Slot[] {
  ensureUpcomingRoutes(now);
  const todayISO = localISODate(now);
  const tomorrowISO = localISODate(new Date(now.getTime() + 86_400_000));

  const slots: Slot[] = [];
  for (const route of q().list.all() as Route[]) {
    if (!isSlotCandidate(route, now, todayISO, tomorrowISO)) continue;

    const cap = slotCapacity(route);
    const count = getOrdersByRoute(route.id).length;
    if (cap != null && count >= cap) continue;

    slots.push({
      routeId: route.id,
      date: route.date,
      time: route.slot_time!,
      label: route.time_slot,
      when: route.date === todayISO ? 'today' : 'tomorrow',
      remaining: cap == null ? null : cap - count,
    });
  }

  slots.sort((a, b) => (`${a.date}${a.time}` < `${b.date}${b.time}` ? -1 : 1));
  return slots.slice(0, 8);
}

/** Y a-t-il des créneaux programmés à venir (indépendamment de leur remplissage) ? */
export function hasUpcomingSlots(now = new Date()): boolean {
  ensureUpcomingRoutes(now);
  const todayISO = localISODate(now);
  const tomorrowISO = localISODate(new Date(now.getTime() + 86_400_000));
  return (q().list.all() as Route[]).some((r) =>
    isSlotCandidate(r, now, todayISO, tomorrowISO),
  );
}
