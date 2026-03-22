import axios, { type AxiosInstance } from 'axios';
import { env } from '../config/env.js';

type CreateRemnawaveUserInput = {
  username: string;
  email: string;
  subscriptionTemplateUuid: string;
  expirationDate: string;
  trafficLimitBytes?: number;
};

type RemnawaveUser = {
  uuid: string;
  shortUuid: string;
};

export class RemnawaveService {
  private readonly client: AxiosInstance | null;

  constructor() {
    if (!env.REMNAWAVE_API_URL || !env.REMNAWAVE_API_KEY) {
      this.client = null;
      return;
    }

    this.client = axios.create({
      baseURL: env.REMNAWAVE_API_URL,
      headers: {
        Authorization: `Bearer ${env.REMNAWAVE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 12000
    });
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async createUser(payload: CreateRemnawaveUserInput): Promise<RemnawaveUser> {
    if (!this.client) {
      throw new Error('Remnawave integration is not configured');
    }

    const { data } = await this.client.post('/users', payload);
    return {
      uuid: data.uuid,
      shortUuid: data.shortUuid
    };
  }

  async getSubscriptionConfig(shortUuid: string): Promise<unknown> {
    if (!this.client) {
      throw new Error('Remnawave integration is not configured');
    }

    const { data } = await this.client.get(`/sub/${shortUuid}`);
    return data;
  }
}

export const remnawaveService = new RemnawaveService();
