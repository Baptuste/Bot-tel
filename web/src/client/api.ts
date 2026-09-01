import { request } from '../api';
import type { CartDto, ClientOrder, Menu, ShopConfig, Slot } from './types';

export const shop = {
  menu: () => request<{ menu: Menu; config: ShopConfig }>('/shop/menu'),

  cart: () => request<CartDto>('/shop/cart'),
  addToCart: (catId: string, prodId: string, qty: number, variantId?: string) =>
    request<CartDto>('/shop/cart', {
      method: 'POST',
      body: JSON.stringify({ catId, prodId, variantId, qty }),
    }),
  setLineQty: (key: string, qty: number) =>
    request<CartDto>('/shop/cart', { method: 'PATCH', body: JSON.stringify({ key, qty }) }),
  clearCart: () => request<CartDto>('/shop/cart', { method: 'DELETE' }),
  reorder: (orderId: number) =>
    request<CartDto & { skipped: string[] }>('/shop/cart/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }),

  slots: () => request<{ slots: Slot[] }>('/shop/slots'),
  lastOrder: () =>
    request<{ address: string | null; phone: string | null; deliveryNote: string | null }>(
      '/shop/last-order',
    ),

  orders: () => request<{ orders: ClientOrder[] }>('/shop/orders'),
  placeOrder: (body: {
    address?: string;
    phone?: string;
    routeId?: number | null;
    deliveryNote?: string | null;
  }) =>
    request<{ orderId: number; status: string }>('/shop/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
