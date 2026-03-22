import { PaymentStatus, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { remnawaveService } from './remnawave.service.js';
import { yooKassaService } from './yookassa.service.js';

export class SubscriptionService {
  async listActivePlans() {
    return prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceKopeks: 'asc' }]
    });
  }

  async createPendingSubscription(userId: string, planId: string) {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw new Error('Plan not found or inactive');
    }

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planId,
        status: SubscriptionStatus.pending,
        trafficLimitGb: plan.trafficLimitGb
      }
    });

    const payment = await yooKassaService.createPayment({
      amountKopeks: plan.priceKopeks,
      description: `Подписка d3MVpn: ${plan.name}`,
      subscriptionId: subscription.id,
      userId
    });

    await prisma.payment.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        yookassaPaymentId: payment.id,
        amountKopeks: plan.priceKopeks,
        status: PaymentStatus.pending
      }
    });

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { paymentId: payment.id }
    });

    return { subscriptionId: subscription.id, paymentUrl: payment.confirmationUrl };
  }

  async activateSubscriptionAfterPayment(subscriptionId: string, paymentId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: true, plan: true }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + subscription.plan.durationDays * 24 * 60 * 60 * 1000);

    let remnawaveUserUuid: string | null = subscription.user.remnawaveUserUuid ?? null;
    let remnawaveShortUuid: string | null = null;

    if (remnawaveService.isEnabled()) {
      const remnawaveUser = await remnawaveService.createUser({
        username: subscription.user.email,
        email: subscription.user.email,
        subscriptionTemplateUuid: subscription.plan.remnawaveTemplateUuid,
        expirationDate: endDate.toISOString(),
        trafficLimitBytes: subscription.trafficLimitGb ? subscription.trafficLimitGb * 1024 * 1024 * 1024 : undefined
      });

      remnawaveUserUuid = remnawaveUser.uuid;
      remnawaveShortUuid = remnawaveUser.shortUuid;

      await prisma.user.update({
        where: { id: subscription.userId },
        data: { remnawaveUserUuid: remnawaveUser.uuid }
      });
    }

    await prisma.payment.update({
      where: { yookassaPaymentId: paymentId },
      data: { status: PaymentStatus.succeeded, paidAt: new Date() }
    });

    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.active,
        startDate,
        endDate,
        remnawaveSubscriptionUuid: remnawaveUserUuid,
        remnawaveShortUuid
      }
    });

    return updatedSubscription;
  }

  async getMySubscription(userId: string) {
    return prisma.subscription.findFirst({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' }
    });
  }
}

export const subscriptionService = new SubscriptionService();
