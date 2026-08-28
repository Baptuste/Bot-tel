import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { alertDialog } from './telegram';
import type { CartLine, Order, RouteWithOrders } from './types';

interface Props {
  order: Order;
  onDone: (updated: Order) => void;
  onCancel: () => void;
}

interface Addable {
  key: string;
  catId: string;
  prodId: string;
  variantId?: string;
  label: string;
  price: number;
}

export function OrderEdit({ order, onDone, onCancel }: Props) {
  const [address, setAddress] = useState(order.address ?? '');
  const [note, setNote] = useState(order.delivery_note ?? '');
  const [routeId, setRouteId] = useState<number | null>(order.route_id);
  const [items, setItems] = useState<CartLine[]>(order.items.map((l) => ({ ...l })));
  const [notify, setNotify] = useState(false);
  const [routes, setRoutes] = useState<RouteWithOrders[]>([]);
  const [addable, setAddable] = useState<Addable[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.routes
      .list()
      .then((d) => setRoutes(d.routes.filter((r) => r.status === 'planned')))
      .catch(() => undefined);
    void api.catalog
      .list()
      .then(({ products, variants }) => {
        const list: Addable[] = [];
        for (const p of products) {
          if (!p.available) continue;
          const pv = variants.filter((v) => v.product_id === p.id && v.available);
          if (pv.length > 0) {
            for (const v of pv) {
              list.push({
                key: `${p.id}:${v.id}`,
                catId: String(p.category_id),
                prodId: String(p.id),
                variantId: String(v.id),
                label: `${p.name} - ${v.label}`,
                price: v.price,
              });
            }
          } else {
            list.push({
              key: String(p.id),
              catId: String(p.category_id),
              prodId: String(p.id),
              label: p.name,
              price: p.price,
            });
          }
        }
        setAddable(list);
      })
      .catch(() => undefined);
  }, []);

  const total = useMemo(() => items.reduce((s, l) => s + l.price * l.qty, 0), [items]);

  function setQty(i: number, qty: number) {
    setItems((prev) =>
      prev.flatMap((l, idx) => (idx === i ? (qty <= 0 ? [] : [{ ...l, qty: Math.min(qty, 99) }]) : [l])),
    );
  }

  function addProduct(a: Addable) {
    setItems((prev) => {
      const i = prev.findIndex(
        (l) => l.prodId === a.prodId && (l.variantId ?? '') === (a.variantId ?? ''),
      );
      if (i >= 0) return prev.map((l, idx) => (idx === i ? { ...l, qty: Math.min(l.qty + 1, 99) } : l));
      return [
        ...prev,
        { catId: a.catId, prodId: a.prodId, variantId: a.variantId, label: a.label, price: a.price, qty: 1 },
      ];
    });
  }

  async function save() {
    if (items.length === 0) {
      alertDialog('La commande doit contenir au moins un article.');
      return;
    }
    setBusy(true);
    try {
      const { order: updated } = await api.editOrder(order.id, {
        address: address.trim(),
        delivery_note: note.trim() || null,
        route_id: routeId,
        items: items.map((l) => ({ catId: l.catId, prodId: l.prodId, variantId: l.variantId, qty: l.qty })),
        notify,
      });
      if (updated) onDone(updated);
    } catch (e) {
      alertDialog(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Modifier #{order.id}</h1>

      <div className="card">
        <div className="label" style={{ marginBottom: 6 }}>
          Articles
        </div>
        {items.map((l, i) => (
          <div key={`${l.prodId}:${l.variantId ?? ''}`} className="product">
            <div>
              {l.label} <span className="muted">- {l.price} EUR</span>
            </div>
            <div className="product-actions">
              <button className="mini" disabled={busy} onClick={() => setQty(i, l.qty - 1)}>
                ➖
              </button>
              <span style={{ minWidth: 20, textAlign: 'center' }}>{l.qty}</span>
              <button className="mini" disabled={busy} onClick={() => setQty(i, l.qty + 1)}>
                ➕
              </button>
              <button className="mini danger" disabled={busy} onClick={() => setQty(i, 0)}>
                🗑
              </button>
            </div>
          </div>
        ))}
        <div className="row total">
          <span>Total</span>
          <span>{total} EUR</span>
        </div>

        <div className="label" style={{ margin: '10px 0 4px' }}>
          Ajouter un produit
        </div>
        <select
          className="add-select"
          value=""
          disabled={busy}
          onChange={(e) => {
            const a = addable.find((x) => x.key === e.target.value);
            if (a) addProduct(a);
          }}
        >
          <option value="">— choisir —</option>
          {addable.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label} ({a.price} €)
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="field">
          <div className="label">Adresse</div>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="field">
          <div className="label">Précision de livraison</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="étage, code…" />
        </div>
        <div className="field">
          <div className="label">Créneau</div>
          <select
            className="add-select"
            value={routeId === null ? '' : String(routeId)}
            onChange={(e) => setRouteId(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">Au plus tôt (non planifié)</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.date} - {r.time_slot}
              </option>
            ))}
          </select>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Prévenir le client de la modification
        </label>
      </div>

      <div className="actions">
        <button className="btn" disabled={busy} onClick={() => void save()}>
          Enregistrer
        </button>
        <button className="btn secondary" disabled={busy} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </>
  );
}
