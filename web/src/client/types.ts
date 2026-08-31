/** Types de la Mini App client — miroir de `src/catalog.ts` / `src/cart.ts` via `/api/shop`. */

export interface MenuVariant {
  id: string;
  label: string;
  price: number;
}

export interface MenuItem {
  label: string;
  price: number; // "à partir de" si variantes
  description: string;
  variants: MenuVariant[];
  image: string | null;
}

export interface MenuCategory {
  label: string;
  items: Record<string, MenuItem>;
}

export type Menu = Record<string, MenuCategory>;

export interface ShopConfig {
  displayName: string;
  fulfillment: 'delivery' | 'pickup' | 'both';
  requiresAddress: boolean;
  requiresPhone: boolean;
  deliverySlots: { enabled: boolean };
  deliveryNote: { enabled: boolean; label: string };
  variants: { enabled: boolean; label: string };
  payment: { methods: Array<'cash' | 'card'>; tipEnabled: boolean };
  loyalty: { enabled: boolean; rewardLabel?: string };
  referral: { enabled: boolean; filleulDiscount?: number };
}

export interface CartLine {
  catId: string;
  prodId: string;
  variantId?: string;
  label: string;
  price: number;
  qty: number;
}

export interface CartDto {
  lines: CartLine[];
  total: number;
  count: number;
}

export interface Slot {
  routeId: number;
  date: string;
  time: string;
  label: string;
  when: 'today' | 'tomorrow';
  remaining: number | null;
}

export interface ClientOrder {
  id: number;
  status: string;
  statusLabel: string;
  total: number;
  items: CartLine[];
  created_at: string;
}

/** Clé d'une ligne de panier (pour PATCH /cart). */
export function lineKey(catId: string, prodId: string, variantId?: string): string {
  return `${catId}:${prodId}:${variantId ?? ''}`;
}
