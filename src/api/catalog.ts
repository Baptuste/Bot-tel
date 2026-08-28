/**
 * API catalogue pour la Mini App admin (l'"outil de creation de menu" du cadrage).
 *
 * Ecrit dans les tables `categories` / `products`. Le bot, lui, lit `getMenu()`
 * (catalogue filtre) sans savoir que cette API existe : les deux ne se connaissent pas.
 */
import { Router } from 'express';
import {
  createCategory,
  createProduct,
  createVariant,
  deleteCategory,
  deleteProduct,
  deleteVariant,
  getProduct,
  listCatalog,
  updateCategory,
  updateProduct,
  updateVariant,
  type Category,
  type Product,
  type Variant,
} from '../catalog';
import { deleteImageFile, saveImageDataUrl } from '../uploads';
import { requireAdmin } from './auth';

/**
 * Resout le champ `image` d'une requete :
 *  - data URL  -> ecrit le fichier, renvoie son nom
 *  - null      -> demande de suppression (renvoie null)
 *  - undefined -> pas de changement
 * Supprime l'ancien fichier si besoin.
 */
function resolveImage(
  value: unknown,
  currentFilename: string | null,
): { filename: string | null } | 'unchanged' | 'invalid' {
  if (value === undefined) return 'unchanged';
  if (value === null) {
    deleteImageFile(currentFilename);
    return { filename: null };
  }
  if (typeof value !== 'string' || !value.startsWith('data:')) return 'invalid';
  const filename = saveImageDataUrl(value);
  if (!filename) return 'invalid';
  deleteImageFile(currentFilename);
  return { filename };
}

export function catalogRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (_req, res) => {
    res.json(listCatalog());
  });

  // --- Categories ---

  router.post('/categories', (req, res) => {
    const label = String(req.body?.label ?? '').trim();
    if (!label) {
      res.status(400).json({ error: 'label_required' });
      return;
    }
    res.status(201).json({ category: createCategory(label) });
  });

  router.patch('/categories/:id', (req, res) => {
    const patch: Partial<Pick<Category, 'label' | 'position'>> = {};
    if (req.body?.label !== undefined) patch.label = String(req.body.label).trim();
    if (req.body?.position !== undefined) patch.position = Number(req.body.position);

    const category = updateCategory(Number(req.params.id), patch);
    if (!category) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ category });
  });

  router.delete('/categories/:id', (req, res) => {
    // Supprime aussi les produits de la categorie (ON DELETE CASCADE).
    res.json({ ok: deleteCategory(Number(req.params.id)) });
  });

  // --- Produits ---

  router.post('/products', (req, res) => {
    const b = req.body ?? {};
    const name = String(b.name ?? '').trim();
    const categoryId = Number(b.category_id);
    const price = Number(b.price);

    if (!name || !Number.isInteger(categoryId) || !Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: 'invalid_product' });
      return;
    }

    const product = createProduct({
      category_id: categoryId,
      name,
      price,
      description: b.description !== undefined ? String(b.description) : undefined,
      available: b.available === undefined ? undefined : Boolean(b.available),
    });
    if (!product) {
      res.status(400).json({ error: 'category_not_found' });
      return;
    }

    const img = resolveImage(b.image, null);
    if (img === 'invalid') {
      res.status(400).json({ error: 'invalid_image' });
      return;
    }
    const finalProduct =
      img === 'unchanged' ? product : updateProduct(product.id, { image: img.filename });
    res.status(201).json({ product: finalProduct });
  });

  router.patch('/products/:id', (req, res) => {
    const b = req.body ?? {};
    const id = Number(req.params.id);

    const existing = getProduct(id);
    if (!existing) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const img = resolveImage(b.image, existing.image);
    if (img === 'invalid') {
      res.status(400).json({ error: 'invalid_image' });
      return;
    }

    const patch: Partial<Omit<Product, 'id'>> = {};
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.description !== undefined) patch.description = String(b.description);
    if (b.price !== undefined) patch.price = Number(b.price);
    if (b.available !== undefined) patch.available = Boolean(b.available);
    if (b.category_id !== undefined) patch.category_id = Number(b.category_id);
    if (b.position !== undefined) patch.position = Number(b.position);
    if (img !== 'unchanged') patch.image = img.filename;

    res.json({ product: updateProduct(id, patch) });
  });

  router.delete('/products/:id', (req, res) => {
    res.json({ ok: deleteProduct(Number(req.params.id)) });
  });

  // --- Variantes (tailles) ---

  router.post('/products/:id/variants', (req, res) => {
    const b = req.body ?? {};
    const label = String(b.label ?? '').trim();
    const price = Number(b.price);
    if (!label || !Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: 'invalid_variant' });
      return;
    }
    const variant = createVariant(Number(req.params.id), {
      label,
      price,
      available: b.available === undefined ? undefined : Boolean(b.available),
    });
    if (!variant) {
      res.status(404).json({ error: 'product_not_found' });
      return;
    }
    res.status(201).json({ variant });
  });

  router.patch('/variants/:id', (req, res) => {
    const b = req.body ?? {};
    const patch: Partial<Omit<Variant, 'id' | 'product_id'>> = {};
    if (b.label !== undefined) patch.label = String(b.label).trim();
    if (b.price !== undefined) patch.price = Number(b.price);
    if (b.available !== undefined) patch.available = Boolean(b.available);
    if (b.position !== undefined) patch.position = Number(b.position);

    const variant = updateVariant(Number(req.params.id), patch);
    if (!variant) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ variant });
  });

  router.delete('/variants/:id', (req, res) => {
    res.json({ ok: deleteVariant(Number(req.params.id)) });
  });

  return router;
}
