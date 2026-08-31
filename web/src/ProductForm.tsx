import { useState } from 'react';
import { fileToResizedDataUrl } from './image';
import { alertDialog } from './telegram';
import type { Product } from './types';

export interface ProductValues {
  name: string;
  price: number;
  description: string;
  available: boolean;
  /** data URL (nouvelle image), null (retirer), ou undefined (inchange). */
  image?: string | null;
}

interface Props {
  product?: Product;
  onSave: (values: ProductValues) => Promise<void>;
  onCancel: () => void;
}

export function ProductForm({ product, onSave, onCancel }: Props) {
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(String(product?.price ?? ''));
  const [description, setDescription] = useState(product?.description ?? '');
  const [available, setAvailable] = useState(product?.available ?? true);
  const [busy, setBusy] = useState(false);

  // image: undefined = inchange, null = retiree, string = nouvelle (data URL)
  const [image, setImage] = useState<string | null | undefined>(undefined);

  const existingUrl = product?.image ? `/uploads/${product.image}` : null;
  const preview = typeof image === 'string' ? image : image === null ? null : existingUrl;

  const priceNum = Number(price);
  const valid = name.trim().length > 0 && Number.isFinite(priceNum) && priceNum >= 0;

  async function pickImage(file: File | undefined) {
    if (!file) return;
    try {
      setImage(await fileToResizedDataUrl(file));
    } catch {
      alertDialog("Impossible de lire l'image.");
    }
  }

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        price: priceNum,
        description: description.trim(),
        available,
        image,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card form">
      <div className="field">
        <div className="label">Nom</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Margherita" />
      </div>
      <div className="field">
        <div className="label">Prix (€)</div>
        <input
          type="number"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="9"
        />
      </div>
      <div className="field">
        <div className="label">Description</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tomate, mozzarella, basilic"
        />
      </div>

      <div className="field">
        <div className="label">Photo</div>
        {preview && <img className="preview" src={preview} alt="" />}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => void pickImage(e.target.files?.[0])}
        />
        {preview && (
          <button className="mini danger" style={{ marginTop: 6 }} onClick={() => setImage(null)}>
            Retirer la photo
          </button>
        )}
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
        Disponible à la vente
      </label>

      <div className="actions">
        <button className="btn" disabled={!valid || busy} onClick={() => void submit()}>
          {product ? 'Enregistrer' : 'Ajouter le produit'}
        </button>
        <button className="btn secondary" disabled={busy} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}
