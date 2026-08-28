/**
 * Livreurs (table `drivers`) — sous-module du module tournees.
 *
 * Liste geree par l'admin (Mini App). Un livreur est affecte a une tournee
 * (`routes.driver_id`) ou sert de defaut sur un modele (`route_templates.driver_id`).
 * Desactiver un livreur le retire des listes de choix sans casser l'historique.
 *
 * Requetes preparees a la demande (comme `routes.ts`) : ce module peut etre
 * importe meme si la table `drivers` n'existe pas (client sans livraison).
 */
import { db } from './db';

export interface Driver {
  id: number;
  name: string;
  phone: string | null;
  active: boolean;
  position: number;
}

interface DriverRow extends Omit<Driver, 'active'> {
  active: number;
}

function buildStatements() {
  return {
    all: db.prepare('SELECT * FROM drivers ORDER BY position, name'),
    active: db.prepare('SELECT * FROM drivers WHERE active = 1 ORDER BY position, name'),
    get: db.prepare<[number]>('SELECT * FROM drivers WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM drivers'),
    insert: db.prepare<{ name: string; phone: string | null; position: number }>(
      'INSERT INTO drivers (name, phone, position) VALUES (@name, @phone, @position)',
    ),
    update: db.prepare<{
      id: number;
      name: string;
      phone: string | null;
      active: number;
      position: number;
    }>(`
      UPDATE drivers
      SET name = @name, phone = @phone, active = @active, position = @position
      WHERE id = @id
    `),
    remove: db.prepare<[number]>('DELETE FROM drivers WHERE id = ?'),
  };
}

let _statements: ReturnType<typeof buildStatements> | undefined;

function q(): ReturnType<typeof buildStatements> {
  if (!_statements) _statements = buildStatements();
  return _statements;
}

function toDriver(row: DriverRow): Driver {
  return { ...row, active: row.active === 1 };
}

export function listDrivers(): Driver[] {
  return (q().all.all() as DriverRow[]).map(toDriver);
}

/** Livreurs disponibles au choix (actifs uniquement). */
export function listActiveDrivers(): Driver[] {
  return (q().active.all() as DriverRow[]).map(toDriver);
}

export function getDriver(id: number): Driver | null {
  const row = q().get.get(id) as DriverRow | undefined;
  return row ? toDriver(row) : null;
}

/** True si `id` designe un livreur existant (pour valider une affectation). */
export function driverExists(id: number): boolean {
  return !!q().get.get(id);
}

export function createDriver(input: { name: string; phone?: string | null }): Driver {
  const position = (q().count.get() as { n: number }).n;
  const id = Number(
    q().insert.run({ name: input.name, phone: input.phone ?? null, position }).lastInsertRowid,
  );
  return toDriver(q().get.get(id) as DriverRow);
}

export function updateDriver(
  id: number,
  patch: Partial<Pick<Driver, 'name' | 'phone' | 'active' | 'position'>>,
): Driver | null {
  const current = q().get.get(id) as DriverRow | undefined;
  if (!current) return null;
  q().update.run({
    id,
    name: patch.name ?? current.name,
    phone: patch.phone === undefined ? current.phone : patch.phone,
    active: patch.active === undefined ? current.active : patch.active ? 1 : 0,
    position: patch.position ?? current.position,
  });
  return getDriver(id);
}

export function deleteDriver(id: number): boolean {
  // ON DELETE SET NULL cote `routes` / `route_templates` : les tournees passees
  // gardent juste "livreur non renseigne".
  return q().remove.run(id).changes > 0;
}
