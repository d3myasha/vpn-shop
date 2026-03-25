import { Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateDiscountRub } from "@/lib/discount";
import { BillingError } from "@/lib/errors";

export { BillingError };

export async function resolveCheckoutUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new BillingError("Пользователь не найден", 404);
  }
  return user;
}

export async function validatePromoCode(rawPromoCode?: string | null) {
  if (!rawPromoCode) {
    return null;
  }

  const code = rawPromoCode.trim().toUpperCase();
  if (!code) {
    return null;
  }

  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo || !promo.isActive) {
    throw new BillingError("Промокод не найден или отключен", 400);
  }

  const now = new Date();
  if (promo.validFrom > now || promo.validUntil < now) {
    throw new BillingError("Промокод неактивен по сроку действия", 400);
  }

  if (promo.activationsCount >= promo.maxActivations) {
    throw new BillingError("Промокод уже использован", 400);
  }

  if (!promo.discountPercent && !promo.discountRub) {
    throw new BillingError("У промокода не задана скидка", 400);
  }

  return promo;
}

export { calculateDiscountRub };

function addDays(baseDate: Date, days: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

async function upsertSubscriptionByPlan(tx: Prisma.TransactionClient, userId: string, planCode: string) {
  const plan = await tx.plan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.isActive) {
    throw new BillingError("План не найден или отключен", 404);
  }

  const latest = await tx.subscription.findFirst({
    where: {
      userId,
      status: {
        not: SubscriptionStatus.CANCELED
      }
    },
    orderBy: { expiresAt: "desc" }
  });

  const now = new Date();
  if (!latest) {
    const created = await tx.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startedAt: now,
        expiresAt: addDays(now, plan.durationDays),
        deviceLimitSnapshot: plan.deviceLimit
      }
    });
    return created;
  }

  const anchor = latest.expiresAt > now ? latest.expiresAt : now;
  return tx.subscription.update({
    where: { id: latest.id },
    data: {
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      expiresAt: addDays(anchor, plan.durationDays),
      deviceLimitSnapshot: plan.deviceLimit
    }
  });
}

async function extendUserLatestSubscription(tx: Prisma.TransactionClient, userId: string, days: number) {
  const latest = await tx.subscription.findFirst({
    where: {
      userId,
      status: {
        not: SubscriptionStatus.CANCELED
      }
    },
    orderBy: { expiresAt: "desc" }
  });

  if (!latest) {
    return false;
  }

  const now = new Date();
  const anchor = latest.expiresAt > now ? latest.expiresAt : now;
  await tx.subscription.update({
    where: { id: latest.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      expiresAt: addDays(anchor, days)
    }
  });
  return true;
}

export async function activatePaymentAndSubscription(params: {
  providerPaymentId: string;
  successfulAmountRub: number;
  planCode: string;
  inviterBonusDays: number;
  invitedBonusDays: number;
}) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { providerPaymentId: params.providerPaymentId },
      include: {
        user: true,
        promoCode: true
      }
    });

    if (!payment) {
      throw new BillingError("Платеж не найден", 404);
    }

    if (payment.status === "SUCCEEDED") {
      return { paymentId: payment.id, subscriptionId: payment.subscriptionId, alreadyProcessed: true };
    }

    if (payment.amountRub !== params.successfulAmountRub) {
      throw new BillingError("Сумма платежа не совпадает с суммой заказа", 400);
    }

    const subscription = await upsertSubscriptionByPlan(tx, payment.userId, params.planCode);

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        subscriptionId: subscription.id
      }
    });

    if (payment.promoCodeId) {
      await tx.promoCode.update({
        where: { id: payment.promoCodeId },
        data: {
          activationsCount: {
            increment: 1
          }
        }
      });
    }

    if (payment.user.referredByUserId) {
      const reward = await tx.referralReward.findFirst({
        where: { paymentId: payment.id }
      });

      if (!reward) {
        await tx.referralReward.create({
          data: {
            paymentId: payment.id,
            inviterUserId: payment.user.referredByUserId,
            invitedUserId: payment.user.id,
            inviterBonusDays: params.inviterBonusDays,
            invitedBonusDays: params.invitedBonusDays
          }
        });

        await extendUserLatestSubscription(tx, payment.user.id, params.invitedBonusDays);
        await extendUserLatestSubscription(tx, payment.user.referredByUserId, params.inviterBonusDays);
      }
    }

    return { paymentId: payment.id, subscriptionId: subscription.id, alreadyProcessed: false };
  });
}
