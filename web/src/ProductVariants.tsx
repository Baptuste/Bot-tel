import { useState } from 'react';
import { api } from './api';
import { useFeatures } from './features';
import { alertDialog, confirmDialog } from './telegram';
import type { Variant } from './types';

interface Props {
  productId: number;
  variants: Variant[];
  busy: boolean;
  onChange: () => Promise<void> | void;
}

/** Gestion des variantes d'un produit (taille, couleur...). 0 variante = produit simple. */
export function ProductVariants({ productId, variants, busy, onChange }: Props) {
  const kind = useFeatures().variants.label; // "Taille", "Couleur"...
  const kindLower = kind.toLocaleLowerCase('fr');
  const [label, setLabel] = useState('');
  const [price, setPrice] = useState('');
  const [working, setWorking] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setWorking(true);
    try {
      await action();
      await onChange();
    } catch (e) {
      alertDialog(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setWorking(false);
    }
  }

  const priceNum = Number(price);
  const canAdd = label.trim().length > 0 && Number.isFinite(priceNum) && priceNum >= 0;
  const disabled = busy || working;

  return (
    <div className="variants">
      {variants.map((v) => (
        <div key={v.id} className={`variant-row ${v.available ? '' : 'off'}`}>
          <span>
            {v.label} <span className="muted">- {v.price} EUR</span>
          </span>
          <span className="product-actions">
            <button
              className="mini"
              disabled={disabled}
              onClick={() => void run(() => api.catalog.updateVariant(v.id, { available: !v.available }))}
            >
              {v.available ? 'Actif' : 'Inactif'}
            </button>
            <button
              className="mini danger"
              disabled={disabled}
              onClick={async () => {
                if (await confirmDialog(`Supprimer la ${kindLower} "${v.label}" ?`)) {
                  await run(() => api.catalog.deleteVariant(v.id));
                }
              }}
            >
              Suppr.
            </button>
          </span>
        </div>
      ))}

      <div className="variant-add">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`${kind} (Senior...)`}
        />
        <input
          type="number"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Prix"
        />
        <button
          className="mini"
          disabled={disabled || !canAdd}
          onClick={() =>
            void run(async () => {
              await api.catalog.addVariant(productId, { label: label.trim(), price: priceNum });
              setLabel('');
              setPrice('');
            })
          }
        >
          + {kind}
        </button>
      </div>
    </div>
  );
}
