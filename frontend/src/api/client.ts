const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

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
};

export type UserPayload = { userId: string; email: string; role: 'user' | 'admin' };

const withJson = async <T>(response: Response): Promise<T> => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed');
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
    return withJson<Record<string, unknown>>(response);
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
    return withJson<{
      totalUsers: number;
      activeSubscriptions: number;
      totalRevenueKopeks: number;
      lifetimeRevenueKopeks: number;
    }>(response);
  },
  async adminUsers(query = '') {
    const response = await fetch(`${API_URL}/admin/users?q=${encodeURIComponent(query)}`, { credentials: 'include' });
    return withJson<{ items: Array<{ id: string; email: string; role: string; createdAt: string }> }>(response);
  }
};
