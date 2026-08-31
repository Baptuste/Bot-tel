/** Un statut = un id d'étape de `features.orderFlow`. */
export type OrderStatus = string;

export type StageRole = 'placed' | 'accepted' | 'fulfilling' | 'fulfilled' | 'cancelled';

export interface OrderStage {
  id: string;
  role: StageRole;
  label: string;
  shortLabel?: string;
  advanceLabel?: string;
  arrivalMessage?: string;
  cancelLabel?: string;
  cancelMessage?: string;
}

/** Configuration metier du deploiement (miroir de `src/features.ts`, via /api/features). */
export interface ClientFeatures {
  clientId: string;
  displayName: string;
  fulfillment: 'delivery' | 'pickup' | 'both';
  requiresAddress: boolean;
  requiresPhone: boolean;
  deliverySlots: { enabled: boolean; drivers: boolean; capacityLimit: number | null };
  deliveryNote: { enabled: boolean; label: string };
  variants: { enabled: boolean; label: string };
  payment: { methods: Array<'cash' | 'card'>; tipEnabled: boolean };
  reliability: { enabled: boolean };
  messaging: { templatesEnabled: boolean };
  loyalty: {
    enabled: boolean;
    pointsPerOrder: number;
    rewardThreshold: number;
    rewardLabel: string;
  };
  referral: { enabled: boolean; filleulDiscount: number; parrainReward: number };
  orderFlow: { stages: OrderStage[] };
}

export interface ReferralInfo {
  code: string;
  filleulDiscount: number;
  parrainReward: number;
  pendingAsFilleul: boolean;
  filleulsCompleted: number;
  creditAvailable: number;
}

export interface LoyaltyStatus {
  points: number;
  pointsPerOrder: number;
  threshold: number;
  rewardLabel: string;
  rewardsAvailable: number;
  toNextReward: number;
}

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
  /** null si le module fiabilité est désactivé pour ce client. */
  reliability: ReliabilitySummary | null;
  /** null si le module fidélité est désactivé. */
  loyalty: { rewardsAvailable: number } | null;
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
  referral_discount: number | null;
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
  /** null si le module fiabilité est désactivé. */
  reliability: ReliabilitySummary | null;
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
  activeRoutes: Array<{
    id: number;
    label: string;
    date: string;
    driver: string | null;
    delivered: number;
    total: number;
  }>;
}

/** Libelle court de fiabilite pour un badge. null si rien a signaler. */
export function reliabilityBadge(r: ReliabilitySummary | null, blocked: boolean): string | null {
  if (blocked) return '🚫 bloqué';
  if (r && r.noShow > 0) {
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

export interface Driver {
  id: number;
  name: string;
  phone: string | null;
  active: boolean;
  position: number;
}

export interface Route {
  id: number;
  date: string;
  time_slot: string;
  slot_time: string | null;
  template_id: number | null;
  max_capacity: number | null;
  driver_id: number | null;
  status: RouteStatus;
  created_at: string;
}

export interface RouteWithOrders extends Route {
  orders: Order[];
  driver: { id: number; name: string } | null;
}

export interface RouteTemplate {
  id: number;
  label: string;
  time: string;
  max_capacity: number | null;
  driver_id: number | null;
  active: boolean;
  position: number;
}

export const ROUTE_STATUS_LABEL: Record<RouteStatus, string> = {
  planned: 'Prévue',
  started: 'En cours',
  done: 'Terminée',
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

