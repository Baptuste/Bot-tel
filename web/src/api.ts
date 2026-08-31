import { initData } from './telegram';
import type {
  Category,
  ClientFeatures,
  Customer,
  CustomerSummary,
  Dashboard,
  Driver,
  LoyaltyStatus,
  MessageTemplate,
  Order,
  ReferralInfo,
  Product,
  Reliability,
  Route,
  RouteTemplate,
  RouteWithOrders,
  Variant,
} from './types';

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `tma ${initData}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  features: () => request<ClientFeatures>('/features'),

  dashboard: () => request<Dashboard>('/dashboard'),

  listOrders: () => request<{ orders: Order[]; counts: Partial<Record<string, number>> }>('/orders'),

  getOrder: (id: number) => request<{ order: Order }>(`/orders/${id}`),

  setStatus: (id: number, status: string, opts?: { reason?: string; no_show?: boolean }) =>
    request<{ order: Order | null }>(`/orders/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, ...opts }),
    }),

  sendMessage: (id: number, text: string) =>
    request<{ ok: true }>(`/orders/${id}/message`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  editOrder: (
    id: number,
    patch: {
      address?: string;
      delivery_note?: string | null;
      route_id?: number | null;
      items?: Array<{ catId: string; prodId: string; variantId?: string; qty: number }>;
      notify?: boolean;
    },
  ) =>
    request<{ order: Order | null }>(`/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  catalog: {
    list: () =>
      request<{ categories: Category[]; products: Product[]; variants: Variant[] }>('/catalog'),

    addCategory: (label: string) =>
      request<{ category: Category }>('/catalog/categories', {
        method: 'POST',
        body: JSON.stringify({ label }),
      }),

    updateCategory: (id: number, patch: Partial<Pick<Category, 'label' | 'position'>>) =>
      request<{ category: Category }>(`/catalog/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    deleteCategory: (id: number) =>
      request<{ ok: boolean }>(`/catalog/categories/${id}`, { method: 'DELETE' }),

    addProduct: (body: {
      category_id: number;
      name: string;
      price: number;
      description?: string;
      available?: boolean;
      image?: string | null;
    }) =>
      request<{ product: Product }>('/catalog/products', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    updateProduct: (id: number, patch: Partial<Omit<Product, 'id'>>) =>
      request<{ product: Product }>(`/catalog/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    deleteProduct: (id: number) =>
      request<{ ok: boolean }>(`/catalog/products/${id}`, { method: 'DELETE' }),

    addVariant: (productId: number, body: { label: string; price: number; available?: boolean }) =>
      request<{ variant: Variant }>(`/catalog/products/${productId}/variants`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    updateVariant: (id: number, patch: Partial<Omit<Variant, 'id' | 'product_id'>>) =>
      request<{ variant: Variant }>(`/catalog/variants/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    deleteVariant: (id: number) =>
      request<{ ok: boolean }>(`/catalog/variants/${id}`, { method: 'DELETE' }),
  },

  routes: {
    list: () =>
      request<{ templates: RouteTemplate[]; routes: RouteWithOrders[]; assignable: Order[] }>(
        '/routes',
      ),

    addTemplate: (body: {
      label: string;
      time: string;
      max_capacity?: number | null;
      driver_id?: number | null;
    }) =>
      request<{ template: RouteTemplate }>('/routes/templates', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    updateTemplate: (id: number, patch: Partial<Omit<RouteTemplate, 'id'>>) =>
      request<{ template: RouteTemplate }>(`/routes/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    deleteTemplate: (id: number) =>
      request<{ ok: boolean }>(`/routes/templates/${id}`, { method: 'DELETE' }),

    create: (date: string, time_slot: string, driver_id?: number | null) =>
      request<{ route: Route }>('/routes', {
        method: 'POST',
        body: JSON.stringify({ date, time_slot, driver_id: driver_id ?? null }),
      }),

    setDriver: (routeId: number, driver_id: number | null) =>
      request<{ route: RouteWithOrders }>(`/routes/${routeId}/driver`, {
        method: 'POST',
        body: JSON.stringify({ driver_id }),
      }),

    assign: (routeId: number, orderId: number) =>
      request<{ order: Order }>(`/routes/${routeId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ order_id: orderId }),
      }),

    unassign: (routeId: number, orderId: number) =>
      request<{ order: Order }>(`/routes/${routeId}/unassign`, {
        method: 'POST',
        body: JSON.stringify({ order_id: orderId }),
      }),

    move: (routeId: number, orderId: number, dir: 'up' | 'down') =>
      request<{ order: Order }>(`/routes/${routeId}/move`, {
        method: 'POST',
        body: JSON.stringify({ order_id: orderId, dir }),
      }),

    start: (routeId: number) =>
      request<{ route: RouteWithOrders }>(`/routes/${routeId}/start`, { method: 'POST' }),

    finish: (routeId: number) =>
      request<{ route: RouteWithOrders }>(`/routes/${routeId}/finish`, { method: 'POST' }),

    remove: (routeId: number) =>
      request<{ ok: boolean }>(`/routes/${routeId}`, { method: 'DELETE' }),
  },

  templates: {
    list: () => request<{ templates: MessageTemplate[] }>('/templates'),
    create: (label: string, content: string) =>
      request<{ template: MessageTemplate }>('/templates', {
        method: 'POST',
        body: JSON.stringify({ label, content }),
      }),
    update: (id: number, patch: Partial<Pick<MessageTemplate, 'label' | 'content' | 'position'>>) =>
      request<{ template: MessageTemplate }>(`/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    remove: (id: number) => request<{ ok: boolean }>(`/templates/${id}`, { method: 'DELETE' }),
  },

  drivers: {
    list: () => request<{ drivers: Driver[] }>('/drivers'),
    create: (name: string, phone?: string) =>
      request<{ driver: Driver }>('/drivers', {
        method: 'POST',
        body: JSON.stringify({ name, phone: phone ?? '' }),
      }),
    update: (id: number, patch: Partial<Pick<Driver, 'name' | 'phone' | 'active' | 'position'>>) =>
      request<{ driver: Driver }>(`/drivers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    remove: (id: number) => request<{ ok: boolean }>(`/drivers/${id}`, { method: 'DELETE' }),
  },

  customers: {
    list: () => request<{ customers: CustomerSummary[] }>('/customers'),

    get: (userId: number) =>
      request<{
        customer: Customer;
        reliability: Reliability | null;
        loyalty: LoyaltyStatus | null;
        referral: ReferralInfo | null;
        orders: Order[];
      }>(`/customers/${userId}`),

    update: (
      userId: number,
      patch: Partial<Pick<Customer, 'name' | 'phone' | 'address' | 'delivery_note' | 'notes' | 'blocked'>>,
    ) =>
      request<{ customer: Customer }>(`/customers/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    redeemLoyalty: (userId: number) =>
      request<{ loyalty: LoyaltyStatus }>(`/customers/${userId}/loyalty/redeem`, { method: 'POST' }),
  },
};
