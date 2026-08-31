import { useBackButton, useMainButton } from './hooks';
import { tap } from '../telegram';
import { placeholderGlyph } from './util';
import { lineKey, type CartDto, type Menu } from './types';

interface Props {
  cart: CartDto;
  menu: Menu;
  busy: boolean;
  onSetQty: (key: string, qty: number) => void;
  onCheckout: () => void;
  onBack: () => void;
}

export function Cart({ cart, menu, busy, onSetQty, onCheckout, onBack }: Props) {
  useBackButton(onBack);
  useMainButton({
    text: `Commander · ${cart.total} €`,
    onClick: onCheckout,
    visible: cart.lines.length > 0,
    loading: busy,
  });

  if (cart.lines.length === 0) {
    return (
      <div className="shop">
        <h1 className="shop-title">Ton panier</h1>
        <p className="empty">Il est vide. Reviens sur la carte pour ajouter des articles.</p>
        <button className="linkback" onClick={onBack}>
          ← La carte
        </button>
      </div>
    );
  }

  return (
    <div className="shop">
      <h1 className="shop-title">Ton panier</h1>

      <ul className="cartlist">
        {cart.lines.map((l) => {
          const img = menu[l.catId]?.items[l.prodId]?.image ?? null;
          const key = lineKey(l.catId, l.prodId, l.variantId);
          return (
            <li key={key} className="cartrow">
              <div className="cartrow__media">
                {img ? (
                  <img src={`/uploads/${img}`} alt="" />
                ) : (
                  <span>{placeholderGlyph(menu[l.catId]?.label, l.label)}</span>
                )}
              </div>
              <div className="cartrow__info">
                <div className="cartrow__name">{l.label}</div>
                <div className="cartrow__unit">{l.price} € l'unité</div>
              </div>
              <div className="cartrow__right">
                <div className="stepper stepper--sm">
                  <button
                    onClick={() => {
                      tap();
                      onSetQty(key, l.qty - 1);
                    }}
                    aria-label="Moins"
                  >
                    –
                  </button>
                  <span>{l.qty}</span>
                  <button
                    onClick={() => {
                      tap();
                      onSetQty(key, l.qty + 1);
                    }}
                    aria-label="Plus"
                  >
                    +
                  </button>
                </div>
                <div className="cartrow__sum">{l.price * l.qty} €</div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="cart-total">
        <span>Total</span>
        <span>{cart.total} €</span>
      </div>
    </div>
  );
}
