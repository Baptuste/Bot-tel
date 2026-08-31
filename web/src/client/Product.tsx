import { useState } from 'react';
import { useBackButton, useMainButton } from './hooks';
import { tap } from '../telegram';
import { placeholderGlyph } from './util';
import type { MenuItem } from './types';

interface Props {
  item: MenuItem;
  catLabel: string;
  variantLabel: string; // "Taille" / "Format"...
  onAdd: (qty: number, variantId?: string) => void;
  onBack: () => void;
}

export function Product({ item, catLabel, variantLabel, onAdd, onBack }: Props) {
  const hasVariants = item.variants.length > 0;
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [qty, setQty] = useState(1);

  useBackButton(onBack);

  const unit = hasVariants
    ? (item.variants.find((v) => v.id === variantId)?.price ?? item.price)
    : item.price;
  const ready = !hasVariants || variantId !== undefined;

  useMainButton({
    text: ready ? `Ajouter · ${unit * qty} €` : `Choisis ${variantLabel.toLowerCase()}`,
    onClick: () => ready && onAdd(qty, variantId),
    loading: !ready,
  });

  return (
    <div className="shop shop--detail">
      <div className={`pdetail__media ${item.image ? '' : 'noimg'}`}>
        {item.image ? (
          <img src={`/uploads/${item.image}`} alt="" />
        ) : (
          <span className="pdetail__mono">{placeholderGlyph(catLabel, item.label)}</span>
        )}
      </div>

      <div className="pdetail__body">
        <div className="pdetail__head">
          <h1 className="pdetail__name">{item.label}</h1>
          {item.description && <p className="pdetail__desc">{item.description}</p>}
        </div>

        {hasVariants && (
          <div className="pick">
            <div className="pick__label">{variantLabel}</div>
            <div className="pick__chips">
              {item.variants.map((v) => (
                <button
                  key={v.id}
                  className={`chip2 ${variantId === v.id ? 'on' : ''}`}
                  onClick={() => {
                    tap();
                    setVariantId(v.id);
                  }}
                >
                  {v.label} · {v.price} €
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="stepper">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Moins">
            –
          </button>
          <span>{qty}</span>
          <button onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Plus">
            +
          </button>
        </div>
      </div>
    </div>
  );
}
