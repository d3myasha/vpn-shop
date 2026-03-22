import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { subscriptionService } from '../services/subscription.service.js';
import { yooKassaService } from '../services/yookassa.service.js';

type YooKassaWebhookPayload = {
  event: string;
  object: {
    id: string;
    status: string;
    paid?: boolean;
    metadata?: {
      subscription_id?: string;
      user_id?: string;
    };
  };
};

export class WebhookController {
  async yookassa(req: Request, res: Response) {
    const signature = req.header('X-Webhook-Signature');
    const rawBody = JSON.stringify(req.body);

    if (!yooKassaService.verifyWebhook(rawBody, signature)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const payload = req.body as YooKassaWebhookPayload;
    if (payload.event !== 'payment.succeeded' || !payload.object?.metadata?.subscription_id) {
      res.status(200).json({ ok: true });
      return;
    }

    const subscriptionId = payload.object.metadata.subscription_id;
    const paymentId = payload.object.id;

    const payment = await prisma.payment.findUnique({ where: { yookassaPaymentId: paymentId } });
    if (!payment) {
      res.status(404).json({ error: 'Payment not found' });
      return;
    }

    if (payment.status === 'succeeded') {
      res.status(200).json({ ok: true });
      return;
    }

    await subscriptionService.activateSubscriptionAfterPayment(subscriptionId, paymentId);
    res.status(200).json({ ok: true });
  }
}

export const webhookController = new WebhookController();
