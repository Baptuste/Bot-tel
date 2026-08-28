import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { ProductForm, type ProductValues } from './ProductForm';
import { ProductVariants } from './ProductVariants';
import { alertDialog, confirmDialog } from './telegram';
import type { Category, Product, Variant } from './types';

/** Cible d'edition : nouveau produit dans une categorie, ou produit existant. */
type Editing = { kind: 'new'; categoryId: number } | { kind: 'edit'; product: Product };

export function Catalog() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.catalog.list();
      setCategories(data.categories);
      setProducts(data.products);
      setVariants(data.variants);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function guard(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      alertDialog(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(values: ProductValues) {
    if (!editing) return;
    if (editing.kind === 'new') {
      await guard(() => api.catalog.addProduct({ category_id: editing.categoryId, ...values }));
    } else {
      await guard(() => api.catalog.updateProduct(editing.product.id, values));
    }
    setEditing(null);
  }

  async function toggleAvailable(p: Product) {
    await guard(() => api.catalog.updateProduct(p.id, { available: !p.available }));
  }

  async function removeProduct(p: Product) {
    if (await confirmDialog(`Supprimer "${p.name}" ?`)) {
      await guard(() => api.catalog.deleteProduct(p.id));
    }
  }

  async function removeCategory(c: Category) {
    const n = products.filter((p) => p.category_id === c.id).length;
    const msg =
      n > 0
        ? `Supprimer "${c.label}" et ses ${n} produit(s) ?`
        : `Supprimer la categorie "${c.label}" ?`;
    if (await confirmDialog(msg)) {
      await guard(() => api.catalog.deleteCategory(c.id));
    }
  }

  async function addCategory() {
    const label = newCategory.trim();
    if (!label) return;
    await guard(() => api.catalog.addCategory(label));
    setNewCategory('');
  }

  if (editing) {
    return (
      <>
        <h1>{editing.kind === 'new' ? 'Nouveau produit' : `Modifier ${editing.product.name}`}</h1>
        <ProductForm
          product={editing.kind === 'edit' ? editing.product : undefined}
          onSave={saveProduct}
          onCancel={() => setEditing(null)}
        />
      </>
    );
  }

  return (
    <>
      <h1>Catalogue</h1>
      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Chargement...</p>}

      {categories.map((c) => {
        const items = products.filter((p) => p.category_id === c.id);
        return (
          <div key={c.id} className="card">
            <div className="row">
              <strong>{c.label}</strong>
              <button className="link-danger" disabled={busy} onClick={() => void removeCategory(c)}>
                Supprimer
              </button>
            </div>

            {items.length === 0 && <p className="muted">Aucun produit.</p>}

            {items.map((p) => {
              const pVariants = variants.filter((v) => v.product_id === p.id);
              return (
                <div key={p.id} className={`product-block ${p.available ? '' : 'off'}`}>
                  <div className="product">
                    <div className="product-info">
                      {p.image && <img className="thumb" src={`/uploads/${p.image}`} alt="" />}
                      <div>
                        <div>
                          {p.name}{' '}
                          <span className="muted">
                            - {pVariants.length > 0 ? `des ${p.price}` : p.price} EUR
                          </span>
                        </div>
                        {p.description && <div className="muted small">{p.description}</div>}
                      </div>
                    </div>
                    <div className="product-actions">
                      <button className="mini" disabled={busy} onClick={() => void toggleAvailable(p)}>
                        {p.available ? 'Actif' : 'Inactif'}
                      </button>
                      <button
                        className="mini"
                        disabled={busy}
                        onClick={() => setEditing({ kind: 'edit', product: p })}
                      >
                        Modifier
                      </button>
                      <button
                        className="mini danger"
                        disabled={busy}
                        onClick={() => void removeProduct(p)}
                      >
                        Suppr.
                      </button>
                    </div>
                  </div>
                  <ProductVariants
                    productId={p.id}
                    variants={pVariants}
                    busy={busy}
                    onChange={load}
                  />
                </div>
              );
            })}

            <button
              className="btn secondary"
              style={{ marginTop: 8 }}
              disabled={busy}
              onClick={() => setEditing({ kind: 'new', categoryId: c.id })}
            >
              + Produit
            </button>
          </div>
        );
      })}

      <div className="card">
        <div className="label" style={{ marginBottom: 6 }}>
          Nouvelle categorie
        </div>
        <input
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="🍹 Boissons"
        />
        <button
          className="btn secondary"
          style={{ marginTop: 8 }}
          disabled={busy || !newCategory.trim()}
          onClick={() => void addCategory()}
        >
          Ajouter la categorie
        </button>
      </div>
    </>
  );
}
