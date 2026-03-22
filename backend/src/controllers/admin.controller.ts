import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';

export class AdminController {
  async stats(_req: Request, res: Response) {
    const [totalUsers, activeSubscriptions, totalRevenue, revenueLast30Days] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.payment.aggregate({
        _sum: { amountKopeks: true },
        where: { status: 'succeeded' }
      }),
      prisma.payment.aggregate({
        _sum: { amountKopeks: true },
        where: {
          status: 'succeeded',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    res.status(200).json({
      totalUsers,
      activeSubscriptions,
      totalRevenueKopeks: revenueLast30Days._sum.amountKopeks ?? 0,
      lifetimeRevenueKopeks: totalRevenue._sum.amountKopeks ?? 0
    });
  }

  async users(req: Request, res: Response) {
    const query = String(req.query.q ?? '').trim();
    const users = await prisma.user.findMany({
      where: query
        ? {
            OR: [{ email: { contains: query, mode: 'insensitive' } }, { telegramId: { contains: query, mode: 'insensitive' } }]
          }
        : undefined,
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 3
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.status(200).json({ items: users });
  }
}

export const adminController = new AdminController();
