import type { Request, Response } from 'express';
import { z } from 'zod';
import { subscriptionService } from '../services/subscription.service.js';
import { remnawaveService } from '../services/remnawave.service.js';

export const createSubscriptionSchema = z.object({
  planId: z.string().uuid()
});

export class SubscriptionController {
  async create(req: Request, res: Response) {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { planId } = req.body as z.infer<typeof createSubscriptionSchema>;
    const result = await subscriptionService.createPendingSubscription(req.user.userId, planId);
    res.status(201).json(result);
  }

  async mySubscription(req: Request, res: Response) {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const subscription = await subscriptionService.getMySubscription(req.user.userId);
    if (!subscription) {
      res.status(404).json({ error: 'No subscription yet' });
      return;
    }

    let config: unknown = null;
    if (subscription.remnawaveShortUuid && remnawaveService.isEnabled()) {
      try {
        config = await remnawaveService.getSubscriptionConfig(subscription.remnawaveShortUuid);
      } catch {
        config = null;
      }
    }

    res.json({ ...subscription, connectionConfig: config });
  }
}

export const subscriptionController = new SubscriptionController();
