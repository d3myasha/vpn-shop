import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

type CreatePaymentInput = {
  amountKopeks: number;
  description: string;
  subscriptionId: string;
  userId: string;
};

type YooKassaPaymentResult = {
  id: string;
  status: string;
  confirmationUrl: string | null;
};

export class YooKassaService {
  private get enabled(): boolean {
    return Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
  }

  async createPayment(payload: CreatePaymentInput): Promise<YooKassaPaymentResult> {
    if (!this.enabled) {
      return {
        id: `mock_${randomUUID()}`,
        status: 'pending',
        confirmationUrl: `${env.APP_URL}/payment/success?mock=1&subscriptionId=${payload.subscriptionId}`
      };
    }

    const amountRub = (payload.amountKopeks / 100).toFixed(2);
    const idempotenceKey = randomUUID();
    const credentials = Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64');

    const { data } = await axios.post(
      'https://api.yookassa.ru/v3/payments',
      {
        amount: { value: amountRub, currency: 'RUB' },
        confirmation: { type: 'redirect', return_url: env.YOOKASSA_RETURN_URL },
        capture: true,
        description: payload.description,
        metadata: {
          subscription_id: payload.subscriptionId,
          user_id: payload.userId
        }
      },
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Idempotence-Key': idempotenceKey,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      id: data.id,
      status: data.status,
      confirmationUrl: data.confirmation?.confirmation_url ?? null
    };
  }

  verifyWebhook(reqBody: string, signature: string | undefined): boolean {
    // In MVP mode we keep webhook verification optional.
    // YooKassa may not provide a signature header in all integration modes.
    // Keep verification permissive until strict HMAC check is implemented.
    if (!env.YOOKASSA_WEBHOOK_SECRET) {
      return true;
    }

    if (!reqBody) {
      return false;
    }

    if (!signature) {
      return true;
    }

    return signature === env.YOOKASSA_WEBHOOK_SECRET;
  }
}

export const yooKassaService = new YooKassaService();
