/**
 * Mini App CLIENT — la vitrine : catalogue photos, panier, checkout.
 * Panier partagé avec le bot (table `cart` en base, via /api/shop).
 */
import { useCallback, useEffect, useState } from 'react';
import { shop } from './api';
import { Cart } from './Cart';
import { Catalog } from './Catalog';
import { Checkout } from './Checkout';
import { OrderSent } from './OrderSent';
import { Orders } from './Orders';
import { Product } from './Product';
import { alertDialog, haptic } from '../telegram';
import type { CartDto, Menu, ShopConfig } from './types';

type Screen =
  | { name: 'catalog' }
  | { name: 'product'; catId: string; prodId: string }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'sent'; orderId: number }
  | { name: 'orders' };

const EMPTY_CART: CartDto = { lines: [], total: 0, count: 0 };

export function ClientApp() {
  const [data, setData] = useState<{ menu: Menu; config: ShopConfig } | null>(null);
  const [cart, setCart] = useState<CartDto>({ lines: [], total: 0, count: 0 });
  const [screen, setScreen] = useState<Screen>({ name: 'catalog' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([shop.menu(), shop.cart()])
      .then(([m, c]) => {
        setData(m);
        setCart(c);
        document.title = m.config.displayName;
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const run = useCallback(async (fn: () => Promise<CartDto>) => {
    setBusy(true);
    try {
      setCart(await fn());
    } catch (e) {
      alertDialog(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }, []);

  const quickAdd = useCallback(
    (catId: string, prodId: string) => {
      void run(() => shop.addToCart(catId, prodId, 1)).then(() => haptic('success'));
    },
    [run],
  );

  const addFromDetail = useCallback(
    (catId: string, prodId: string, qty: number, variantId?: string) => {
      void run(() => shop.addToCart(catId, prodId, qty, variantId)).then(() => {
        haptic('success');
        setScreen({ name: 'catalog' });
      });
    },
    [run],
  );

  const setQty = useCallback(
    (key: string, qty: number) => void run(() => shop.setLineQty(key, qty)),
    [run],
  );

  const onReorder = useCallback((orderId: number) => {
    setBusy(true);
    shop
      .reorder(orderId)
      .then((r) => {
        setCart({ lines: r.lines, total: r.total, count: r.count });
        haptic('success');
        if (r.skipped.length > 0) {
          alertDialog(`Plus au menu, non repris : ${r.skipped.join(', ')}.`);
        }
        setScreen({ name: 'cart' });
      })
      .catch((e) => alertDialog(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setBusy(false));
  }, []);

  const onItemsChanged = useCallback(
    (removed: string[]) => {
      haptic('warning');
      shop.cart().then(setCart).catch(() => {});
      alertDialog(
        removed.length > 0
          ? `Plus disponible, retiré du panier : ${removed.join(', ')}. Vérifie et renvoie.`
          : 'Ton panier a changé, vérifie-le avant de commander.',
      );
      setScreen({ name: 'cart' });
    },
    [],
  );

  if (error) return <div className="error">Chargement impossible : {error}</div>;
  if (!data) return <p className="muted">Chargement…</p>;
  const { menu, config } = data;

  if (screen.name === 'product') {
    const item = menu[screen.catId]?.items[screen.prodId];
    if (!item) {
      setScreen({ name: 'catalog' });
      return null;
    }
    return (
      <Product
        item={item}
        catLabel={menu[screen.catId]?.label ?? ''}
        variantLabel={config.variants.label}
        onAdd={(qty, variantId) => addFromDetail(screen.catId, screen.prodId, qty, variantId)}
        onBack={() => setScreen({ name: 'catalog' })}
      />
    );
  }

  if (screen.name === 'cart') {
    return (
      <Cart
        cart={cart}
        menu={menu}
        busy={busy}
        onSetQty={setQty}
        onCheckout={() => setScreen({ name: 'checkout' })}
        onBack={() => setScreen({ name: 'catalog' })}
      />
    );
  }

  if (screen.name === 'checkout') {
    if (cart.lines.length === 0) {
      setScreen({ name: 'catalog' });
      return null;
    }
    return (
      <Checkout
        config={config}
        cart={cart}
        onDone={(orderId) => {
          setCart(EMPTY_CART);
          haptic('success');
          setScreen({ name: 'sent', orderId });
        }}
        onItemsChanged={onItemsChanged}
        onBack={() => setScreen({ name: 'cart' })}
      />
    );
  }

  if (screen.name === 'sent') {
    return (
      <OrderSent orderId={screen.orderId} onOrders={() => setScreen({ name: 'orders' })} />
    );
  }

  if (screen.name === 'orders') {
    return <Orders onReorder={onReorder} onBack={() => setScreen({ name: 'catalog' })} />;
  }

  return (
    <Catalog
      menu={menu}
      config={config}
      cart={cart}
      onOpen={(catId, prodId) => setScreen({ name: 'product', catId, prodId })}
      onQuickAdd={quickAdd}
      onCart={() => setScreen({ name: 'cart' })}
      onOrders={() => setScreen({ name: 'orders' })}
    />
  );
}
