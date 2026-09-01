/**
 * Catalogue : source unique du menu, en base (tables `categories` + `products`).
 *
 * - Le BOT lit un `Menu` filtre (categories non vides, produits disponibles) via
 *   `getMenu()`. Le cache est invalide des qu'une ecriture a lieu.
 * - La MINI APP admin lit/ecrit le catalogue complet (produits indisponibles inclus)
 *   via les fonctions `listCatalog` / `create*` / `update*` / `delete*`.
 *
 * `menu.json` (racine) ne sert plus qu'a semer la base au tout premier demarrage.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from './db';
import { features } from './features';
import type { CartLine, Menu, MenuItem, MenuVariant } from './types';
import { deleteImageFile } from './uploads';

export interface Category {
  id: number;
  label: string;
  position: number;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price: number;
  available: boolean;
  image: string | null;
  position: number;
}

export interface Variant {
  id: number;
  product_id: number;
  label: string;
  price: number;
  available: boolean;
  position: number;
}

interface ProductRow extends Omit<Product, 'available'> {
  available: number;
}

interface VariantRow extends Omit<Variant, 'available'> {
  available: number;
}

// --- Requetes preparees -----------------------------------------------------

const q = {
  categories: db.prepare('SELECT * FROM categories ORDER BY position, id'),
  products: db.prepare('SELECT * FROM products ORDER BY position, id'),
  productsByCategory: db.prepare(
    'SELECT * FROM products WHERE category_id = ? ORDER BY position, id',
  ),
  countCategories: db.prepare('SELECT COUNT(*) AS n FROM categories'),

  insertCategory: db.prepare<[string, number]>(
    'INSERT INTO categories (label, position) VALUES (?, ?)',
  ),
  updateCategory: db.prepare<[string, number, number]>(
    'UPDATE categories SET label = ?, position = ? WHERE id = ?',
  ),
  deleteCategory: db.prepare<[number]>('DELETE FROM categories WHERE id = ?'),
  getCategory: db.prepare<[number]>('SELECT * FROM categories WHERE id = ?'),

  insertProduct: db.prepare<{
    category_id: number;
    name: string;
    description: string;
    price: number;
    available: number;
    position: number;
  }>(`
    INSERT INTO products (category_id, name, description, price, available, position)
    VALUES (@category_id, @name, @description, @price, @available, @position)
  `),
  updateProduct: db.prepare<{
    id: number;
    category_id: number;
    name: string;
    description: string;
    price: number;
    available: number;
    image: string | null;
    position: number;
  }>(`
    UPDATE products
    SET category_id = @category_id, name = @name, description = @description,
        price = @price, available = @available, image = @image, position = @position
    WHERE id = @id
  `),
  deleteProduct: db.prepare<[number]>('DELETE FROM products WHERE id = ?'),
  getProduct: db.prepare<[number]>('SELECT * FROM products WHERE id = ?'),

  variants: db.prepare('SELECT * FROM product_variants ORDER BY position, id'),
  variantsByProduct: db.prepare(
    'SELECT * FROM product_variants WHERE product_id = ? ORDER BY position, id',
  ),
  getVariant: db.prepare<[number]>('SELECT * FROM product_variants WHERE id = ?'),
  insertVariant: db.prepare<{
    product_id: number;
    label: string;
    price: number;
    available: number;
    position: number;
  }>(
    'INSERT INTO product_variants (product_id, label, price, available, position) VALUES (@product_id, @label, @price, @available, @position)',
  ),
  updateVariant: db.prepare<{
    id: number;
    label: string;
    price: number;
    available: number;
    position: number;
  }>(
    'UPDATE product_variants SET label = @label, price = @price, available = @available, position = @position WHERE id = @id',
  ),
  deleteVariant: db.prepare<[number]>('DELETE FROM product_variants WHERE id = ?'),
};

function toProduct(row: ProductRow): Product {
  return { ...row, available: row.available === 1 };
}

function toVariant(row: VariantRow): Variant {
  return { ...row, available: row.available === 1 };
}

// --- Seed initial ----------------------------------------------------------

/**
 * Importe menu.json dans la base si le catalogue est vide (1er demarrage).
 * `SEED_DEMO_CATALOG=0` (prod : vrai commerce) -> ne seme rien, le catalogue
 * se saisit via la Mini App admin.
 */
export function seedCatalogIfEmpty(): void {
  const { n } = q.countCategories.get() as { n: number };
  if (n > 0) return;
  if (process.env.SEED_DEMO_CATALOG === '0') {
    console.log('[catalog] SEED_DEMO_CATALOG=0 : catalogue laisse vide (a saisir dans la Mini App).');
    return;
  }

  const raw = readFileSync(resolve(process.cwd(), 'menu.json'), 'utf-8');
  const json = JSON.parse(raw) as Record<
    string,
    { label: string; items: Record<string, { label: string; price: number; description: string }> }
  >;

  const seed = db.transaction(() => {
    let catPos = 0;
    for (const cat of Object.values(json)) {
      const catId = Number(q.insertCategory.run(cat.label, catPos++).lastInsertRowid);
      let prodPos = 0;
      for (const item of Object.values(cat.items)) {
        q.insertProduct.run({
          category_id: catId,
          name: item.label,
          description: item.description,
          price: item.price,
          available: 1,
          position: prodPos++,
        });
      }
    }
  });
  seed();
  console.log(`[catalog] catalogue seme depuis menu.json (${Object.keys(json).length} categories).`);
}

// --- Lecture cote BOT -----------------------------------------------------

let menuCache: Menu | null = null;

/**
 * Menu filtre pour le bot : categories non vides, produits disponibles uniquement.
 *
 * Note module : si `features.variants.enabled` est faux, les variantes sont
 * masquees ici (produit traite comme simple, au prix de base) — le point unique
 * ou le bot, le panier et la validation voient le menu. L'editeur de catalogue
 * de la Mini App (`listCatalog`) n'est pas concerne et garde toutes les variantes.
 */
export function getMenu(): Menu {
  if (menuCache) return menuCache;

  const withVariants = features.variants.enabled;
  const menu: Menu = {};
  for (const cat of q.categories.all() as Category[]) {
    const items = (q.productsByCategory.all(cat.id) as ProductRow[])
      .filter((p) => p.available === 1)
      .reduce<Record<string, MenuItem>>((acc, p) => {
        const variants: MenuVariant[] = withVariants
          ? (q.variantsByProduct.all(p.id) as VariantRow[])
              .filter((v) => v.available === 1)
              .map((v) => ({ id: String(v.id), label: v.label, price: v.price }))
          : [];

        // Prix affiche : "a partir de" la variante la moins chere, sinon le prix de base.
        const price =
          variants.length > 0 ? Math.min(...variants.map((v) => v.price)) : p.price;

        acc[String(p.id)] = {
          label: p.name,
          price,
          description: p.description,
          variants,
          image: p.image,
        };
        return acc;
      }, {});

    if (Object.keys(items).length > 0) {
      menu[String(cat.id)] = { label: cat.label, items };
    }
  }

  menuCache = menu;
  return menu;
}

function invalidate(): void {
  menuCache = null;
}

/** Force une relecture depuis la base (utilise a la validation d'une commande). */
export function reloadMenu(): Menu {
  invalidate();
  return getMenu();
}

export interface ItemRef {
  catId: string;
  prodId: string;
  variantId?: string;
  qty: number;
}

/**
 * Resout des references produit vers des lignes de panier au prix / libelle
 * COURANTS (menu frais). `missing` = refs introuvables ou incompletes.
 */
export function resolveMenuItems(refs: ItemRef[]): { items: CartLine[]; missing: number } {
  const menu = reloadMenu();
  const items: CartLine[] = [];
  let missing = 0;

  for (const ref of refs) {
    const item = menu[ref.catId]?.items[ref.prodId];
    const qty = Math.max(1, Math.min(99, Math.floor(Number(ref.qty) || 0)));
    if (!item || qty < 1) {
      missing++;
      continue;
    }
    if (ref.variantId) {
      const variant = item.variants.find((v) => v.id === ref.variantId);
      if (!variant) {
        missing++;
        continue;
      }
      items.push({
        catId: ref.catId,
        prodId: ref.prodId,
        variantId: ref.variantId,
        label: `${item.label} - ${variant.label}`,
        price: variant.price,
        qty,
      });
    } else if (item.variants.length > 0) {
      missing++; // produit a tailles : il faut choisir une variante
    } else {
      items.push({ catId: ref.catId, prodId: ref.prodId, label: item.label, price: item.price, qty });
    }
  }
  return { items, missing };
}

// --- Lecture cote ADMIN --------------------------------------------------

export function getProduct(id: number): Product | null {
  const row = q.getProduct.get(id) as ProductRow | undefined;
  return row ? toProduct(row) : null;
}

export function listCatalog(): {
  categories: Category[];
  products: Product[];
  variants: Variant[];
} {
  return {
    categories: q.categories.all() as Category[],
    products: (q.products.all() as ProductRow[]).map(toProduct),
    variants: (q.variants.all() as VariantRow[]).map(toVariant),
  };
}

// --- Ecriture (Mini App admin) -----------------------------------------

export function createCategory(label: string): Category {
  const pos = (q.categories.all() as Category[]).length;
  const id = Number(q.insertCategory.run(label, pos).lastInsertRowid);
  invalidate();
  return q.getCategory.get(id) as Category;
}

export function updateCategory(
  id: number,
  patch: Partial<Pick<Category, 'label' | 'position'>>,
): Category | null {
  const current = q.getCategory.get(id) as Category | undefined;
  if (!current) return null;
  q.updateCategory.run(patch.label ?? current.label, patch.position ?? current.position, id);
  invalidate();
  return q.getCategory.get(id) as Category;
}

export function deleteCategory(id: number): boolean {
  for (const p of q.productsByCategory.all(id) as ProductRow[]) deleteImageFile(p.image);
  const changes = q.deleteCategory.run(id).changes; // ON DELETE CASCADE -> produits + variantes
  invalidate();
  return changes > 0;
}

export interface NewProduct {
  category_id: number;
  name: string;
  description?: string;
  price: number;
  available?: boolean;
}

export function createProduct(p: NewProduct): Product | null {
  if (!(q.getCategory.get(p.category_id) as Category | undefined)) return null;
  const pos = (q.productsByCategory.all(p.category_id) as ProductRow[]).length;
  const id = Number(
    q.insertProduct.run({
      category_id: p.category_id,
      name: p.name,
      description: p.description ?? '',
      price: p.price,
      available: p.available === false ? 0 : 1,
      position: pos,
    }).lastInsertRowid,
  );
  invalidate();
  return toProduct(q.getProduct.get(id) as ProductRow);
}

export function updateProduct(
  id: number,
  patch: Partial<Omit<Product, 'id'>>,
): Product | null {
  const current = q.getProduct.get(id) as ProductRow | undefined;
  if (!current) return null;
  q.updateProduct.run({
    id,
    category_id: patch.category_id ?? current.category_id,
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    price: patch.price ?? current.price,
    available:
      patch.available === undefined ? current.available : patch.available ? 1 : 0,
    image: patch.image === undefined ? current.image : patch.image,
    position: patch.position ?? current.position,
  });
  invalidate();
  return toProduct(q.getProduct.get(id) as ProductRow);
}

export function deleteProduct(id: number): boolean {
  const current = q.getProduct.get(id) as ProductRow | undefined;
  deleteImageFile(current?.image);
  const changes = q.deleteProduct.run(id).changes;
  invalidate();
  return changes > 0;
}

// --- Variantes (tailles) --------------------------------------------------

export interface NewVariant {
  label: string;
  price: number;
  available?: boolean;
}

export function createVariant(productId: number, v: NewVariant): Variant | null {
  if (!(q.getProduct.get(productId) as ProductRow | undefined)) return null;
  const pos = (q.variantsByProduct.all(productId) as VariantRow[]).length;
  const id = Number(
    q.insertVariant.run({
      product_id: productId,
      label: v.label,
      price: v.price,
      available: v.available === false ? 0 : 1,
      position: pos,
    }).lastInsertRowid,
  );
  invalidate();
  return toVariant(q.getVariant.get(id) as VariantRow);
}

export function updateVariant(
  id: number,
  patch: Partial<Omit<Variant, 'id' | 'product_id'>>,
): Variant | null {
  const current = q.getVariant.get(id) as VariantRow | undefined;
  if (!current) return null;
  q.updateVariant.run({
    id,
    label: patch.label ?? current.label,
    price: patch.price ?? current.price,
    available: patch.available === undefined ? current.available : patch.available ? 1 : 0,
    position: patch.position ?? current.position,
  });
  invalidate();
  return toVariant(q.getVariant.get(id) as VariantRow);
}

export function deleteVariant(id: number): boolean {
  const changes = q.deleteVariant.run(id).changes;
  invalidate();
  return changes > 0;
}
