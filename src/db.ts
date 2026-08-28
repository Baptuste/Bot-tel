/**
 * Connexion SQLite + schema.
 *
 * Le principe du projet en action : chaque nouvelle brique = une nouvelle table
 * qui se greffe, sans reecrire l'existant. Ici on ouvre la brique "commandes".
 *
 * better-sqlite3 est SYNCHRONE : pas de `await` sur les requetes, c'est voulu et
 * parfaitement adapte a la charge d'un petit commerce.
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const DB_PATH = resolve(process.cwd(), 'data', 'bot.db');

export const db = new Database(DB_PATH);

// WAL : meilleures perfs en lecture/ecriture concurrentes, recommande par better-sqlite3.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Migrations : on cree les tables si elles n'existent pas.
 * Approche volontairement simple pour la V1 (pas d'outil de migration).
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    username    TEXT,
    phone       TEXT    NOT NULL,
    items       TEXT    NOT NULL,               -- JSON : CartLine[] (photo figee de la commande)
    address     TEXT    NOT NULL,
    total       INTEGER NOT NULL,               -- en euros
    status      TEXT    NOT NULL DEFAULT 'pending',
    route_id    INTEGER,                        -- rempli plus tard (brique tournees)
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders (user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

  -- Catalogue : le menu vit desormais en base (edite via la Mini App admin).
  -- menu.json ne sert plus que de contenu initial (seed au 1er demarrage).
  CREATE TABLE IF NOT EXISTS categories (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    label     TEXT    NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    price        INTEGER NOT NULL,              -- en euros
    available    INTEGER NOT NULL DEFAULT 1,    -- 0/1 : desactivation sans suppression
    image        TEXT,                          -- nom de fichier dans data/uploads/ (ou null)
    position     INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);

  -- Variantes (tailles) d'un produit : ex Senior / Mega, chacune son prix.
  -- 0 variante -> produit simple (products.price). >=1 -> le client choisit la taille.
  CREATE TABLE IF NOT EXISTS product_variants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label      TEXT    NOT NULL,
    price      INTEGER NOT NULL,
    available  INTEGER NOT NULL DEFAULT 1,
    position   INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants (product_id);

  -- Clients : profil consolide (1 ligne par user_id Telegram). Cree/mis a jour a
  -- chaque commande. Le taux de fiabilite est CALCULE depuis orders (pas stocke).
  CREATE TABLE IF NOT EXISTS customers (
    user_id       INTEGER PRIMARY KEY,
    username      TEXT,
    name          TEXT,                     -- nom complet (saisi par l'admin)
    phone         TEXT,                     -- dernier numero connu
    address       TEXT,                     -- derniere adresse connue
    delivery_note TEXT,                     -- instruction de livraison (etage, code)
    notes         TEXT,                     -- notes ADMIN (privees)
    blocked       INTEGER NOT NULL DEFAULT 0,
    first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Modeles de messages : reponses pre-ecrites reutilisables par l'admin
  -- ("on arrive", "rupture, on remplace par...", "leger retard"...).
  CREATE TABLE IF NOT EXISTS message_templates (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    label    TEXT    NOT NULL,
    content  TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  -- Sessions : etat temporaire d'une conversation (scene en cours).
  -- A ne PAS confondre avec une commande (donnee definitive). Nettoyees par 3
  -- mecanismes : suppression a la sortie de scene, TTL a la lecture, purge planifiee.
  CREATE TABLE IF NOT EXISTS sessions (
    key         TEXT PRIMARY KEY,          -- cle telegraf "<fromId>:<chatId>"
    scene       TEXT,                      -- scene courante (inspection / debug)
    data        TEXT    NOT NULL,          -- JSON de l'objet session
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Modeles de tournees : creneaux recurrents (ex: 15:00 / 18:00 / 21:00 chaque jour).
  -- Un planificateur materialise les tournees du jour a partir des modeles actifs.
  CREATE TABLE IF NOT EXISTS route_templates (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    label        TEXT    NOT NULL,               -- affiche au client / a l'admin
    time         TEXT    NOT NULL,               -- 'HH:MM' (pour le tri + la coupure)
    max_capacity INTEGER,                        -- null = illimite
    active       INTEGER NOT NULL DEFAULT 1,
    position     INTEGER NOT NULL DEFAULT 0
  );

  -- Tournees de livraison : instance d'un creneau, un jour donne.
  -- Une commande confirmee y est affectee (par le client au checkout, ou par l'admin).
  -- Demarrer / terminer une tournee fait avancer le statut de ses commandes (+ notif client).
  CREATE TABLE IF NOT EXISTS routes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL,               -- 'YYYY-MM-DD'
    time_slot    TEXT    NOT NULL,               -- libelle affiche
    slot_time    TEXT,                           -- 'HH:MM' si issu d'un modele
    template_id  INTEGER REFERENCES route_templates(id) ON DELETE SET NULL,
    max_capacity INTEGER,
    status       TEXT    NOT NULL DEFAULT 'planned',  -- planned | started | done
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Migrations additives pour les bases deja creees ---------------------
// (PRAGMA n'accepte pas de parametre lie ; le nom de table est un litteral ici.)
function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('routes', 'slot_time', 'TEXT');
ensureColumn('routes', 'template_id', 'INTEGER');
ensureColumn('routes', 'max_capacity', 'INTEGER');
ensureColumn('products', 'image', 'TEXT');
ensureColumn('orders', 'cancellation_reason', 'TEXT');
ensureColumn('orders', 'no_show', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('orders', 'delivery_note', 'TEXT');
ensureColumn('orders', 'route_position', 'INTEGER');
ensureColumn('orders', 'updated_at', 'TEXT');
ensureColumn('orders', 'delivered_at', 'TEXT');
ensureColumn('orders', 'alerted', 'INTEGER NOT NULL DEFAULT 0');
db.exec('UPDATE orders SET updated_at = created_at WHERE updated_at IS NULL');
