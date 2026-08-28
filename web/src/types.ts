export type OrderStatus = 'pending' | 'confirmed' | 'delivering' | 'delivered' | 'cancelled';

export interface CartLine {
  catId: string;
  prodId: string;
  variantId?: string;
  label: string;
  price: number;
  qty: number;
}

export interface StatusOption {
  to: OrderStatus;
  label: string;
}

export interface OrderRouteInfo {
  id: number;
  date: string;
  label: string;
  status: RouteStatus;
}

export interface ReliabilitySummary {
  delivered: number;
  noShow: number;
  rate: number | null;
}

export interface OrderCustomerInfo {
  name: string | null;
  blocked: boolean;
  delivery_note: string | null;
  reliability: ReliabilitySummary;
}

export interface Order {
  id: number;
  user_id: number;
  username: string | null;
  phone: string | null;
  items: CartLine[];
  address: string | null;
  total: number;
  status: OrderStatus;
  route_id: number | null;
  route: OrderRouteInfo | null;
  cancellation_reason: string | null;
  no_show: boolean;
  delivery_note: string | null;
  customer: OrderCustomerInfo;
  created_at: string;
  next: StatusOption[];
}

export interface Customer {
  user_id: number;
  username: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  delivery_note: string | null;
  notes: string | null;
  blocked: boolean;
  first_seen: string;
  updated_at: string;
}

export interface CustomerSummary extends Customer {
  total_orders: number;
  delivered: number;
  no_show: number;
}

export interface Reliability {
  total: number;
  delivered: number;
  noShow: number;
  cancelledOther: number;
  active: number;
  rate: number | null;
}

export interface MessageTemplate {
  id: number;
  label: string;
  content: string;
  position: number;
}

export interface Dashboard {
  counts: Partial<Record<OrderStatus, number>>;
  today: { orders: number; delivered: number; cancelled: number; revenue: number };
  pending: Array<{ id: number; who: string; total: number; minutes: number; overdue: boolean }>;
  activeRoutes: Array<{ id: number; label: string; date: string; delivered: number; total: number }>;
}

/** Libelle court de fiabilite pour un badge. null si rien a signaler. */
export function reliabilityBadge(r: ReliabilitySummary, blocked: boolean): string | null {
  if (blocked) return '🚫 bloqué';
  if (r.noShow > 0) {
    const pct = r.rate === null ? '' : ` ${Math.round(r.rate * 100)}%`;
    return `⚠️ ${r.noShow} no-show${pct}`;
  }
  return null;
}

export interface Category {
  id: number;
  label: string;
  position: number;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price: number;
  available: boolean;
  image: string | null;
  position: number;
}

export interface Variant {
  id: number;
  product_id: number;
  label: string;
  price: number;
  available: boolean;
  position: number;
}

export type RouteStatus = 'planned' | 'started' | 'done';

export interface Route {
  id: number;
  date: string;
  time_slot: string;
  slot_time: string | null;
  template_id: number | null;
  max_capacity: number | null;
  status: RouteStatus;
  created_at: string;
}

export interface RouteWithOrders extends Route {
  orders: Order[];
}

export interface RouteTemplate {
  id: number;
  label: string;
  time: string;
  max_capacity: number | null;
  active: boolean;
  position: number;
}

export const ROUTE_STATUS_LABEL: Record<RouteStatus, string> = {
  planned: 'Prevue',
  started: 'En cours',
  done: 'Terminee',
};

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Libelle du creneau souhaite par le client (ou "au plus tot" si non planifie). */
export function slotText(route: OrderRouteInfo | null): string {
  if (!route) return 'au plus tot';
  const day =
    route.date === localDate(0)
      ? "aujourd'hui"
      : route.date === localDate(1)
        ? 'demain'
        : route.date;
  return `${route.label} (${day})`;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmee',
  delivering: 'En livraison',
  delivered: 'Livree',
  cancelled: 'Annulee',
};
