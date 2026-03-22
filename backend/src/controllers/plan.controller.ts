import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { subscriptionService } from '../services/subscription.service.js';

export const createPlanSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  priceKopeks: z.number().int().positive(),
  durationDays: z.number().int().positive(),
  trafficLimitGb: z.number().int().positive().optional(),
  remnawaveTemplateUuid: z.string().uuid(),
  sortOrder: z.number().int().default(0)
});

export class PlanController {
  async listPublic(_req: Request, res: Response) {
    const plans = await subscriptionService.listActivePlans();
    res.json({ items: plans });
  }

  async listAdmin(_req: Request, res: Response) {
    const plans = await prisma.subscriptionPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
    res.json({ items: plans });
  }

  async create(req: Request, res: Response) {
    const payload = req.body as z.infer<typeof createPlanSchema>;
    const plan = await prisma.subscriptionPlan.create({ data: payload });
    res.status(201).json(plan);
  }
}

export const planController = new PlanController();
