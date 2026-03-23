const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  priceKopeks: number;
  durationDays: number;
  trafficLimitGb?: number | null;
  remnawaveTemplateUuid?: string;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type UserPayload = { userId: string; email: string; role: 'user' | 'admin' };

export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'cancelled';

export type SubscriptionResponse = {
  id: string;
  status: SubscriptionStatus;
  startDate: string | null;
  endDate: string | null;
  trafficLimitGb: number | null;
  createdAt: string;
  paymentId: string | null;
  plan: Plan;
  connectionConfig?: unknown;
};

export type AdminStats = {
  totalUsers: number;
  activeSubscriptions: number;
  totalRevenueKopeks: number;
  lifetimeRevenueKopeks: number;
};

export type AdminUser = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  telegramId?: string | null;
  subscriptions?: Array<{
    id: string;
    status: SubscriptionStatus;
    createdAt: string;
    endDate: string | null;
    plan?: {
      id: string;
      name: string;
      priceKopeks: number;
    };
  }>;
};

const withJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : 'Request failed';
    throw new ApiError(message, response.status);
  }

  return data as T;
};

export const api = {
  async register(email: string, password: string) {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    return withJson<{ user: UserPayload }>(response);
  },
  async login(email: string, password: string) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    return withJson<{ user: UserPayload }>(response);
  },
  async refresh() {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    });
    return withJson<{ user: UserPayload }>(response);
  },
  async logout() {
    const response = await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    return withJson<{ ok: boolean }>(response);
  },
  async plans() {
    const response = await fetch(`${API_URL}/plans`, { credentials: 'include' });
    return withJson<{ items: Plan[] }>(response);
  },
  async buy(planId: string) {
    const response = await fetch(`${API_URL}/subscriptions/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ planId })
    });
    return withJson<{ subscriptionId: string; paymentUrl: string | null }>(response);
  },
  async mySubscription() {
    const response = await fetch(`${API_URL}/subscriptions/me`, { credentials: 'include' });
    return withJson<SubscriptionResponse>(response);
  },
  async adminPlans() {
    const response = await fetch(`${API_URL}/plans/admin`, { credentials: 'include' });
    return withJson<{ items: Plan[] }>(response);
  },
  async createPlan(payload: Omit<Plan, 'id'>) {
    const response = await fetch(`${API_URL}/plans/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    return withJson<Plan>(response);
  },
  async updatePlan(id: string, payload: Partial<Omit<Plan, 'id'>>) {
    const response = await fetch(`${API_URL}/plans/admin/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    return withJson<Plan>(response);
  },
  async deletePlan(id: string) {
    const response = await fetch(`${API_URL}/plans/admin/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    return withJson<{ ok: boolean }>(response);
  },
  async adminStats() {
    const response = await fetch(`${API_URL}/admin/stats`, { credentials: 'include' });
    return withJson<AdminStats>(response);
  },
  async adminUsers(query = '') {
    const response = await fetch(`${API_URL}/admin/users?q=${encodeURIComponent(query)}`, { credentials: 'include' });
    return withJson<{ items: AdminUser[] }>(response);
  }
};
