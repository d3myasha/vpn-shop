const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  priceKopeks: number;
  durationDays: number;
};

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
    return withJson<{ user: { userId: string; email: string } }>(response);
  },
  async login(email: string, password: string) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    return withJson<{ user: { userId: string; email: string } }>(response);
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
  }
};
