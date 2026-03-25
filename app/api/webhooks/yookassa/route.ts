import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { activatePaymentAndSubscription, BillingError } from "@/lib/billing";
import { getYooKassaPayment } from "@/lib/yookassa";
import { syncRemnawaveSubscription } from "@/lib/remnawave";
import { assertIpAllowed, assertRateLimit, getRequestIp } from "@/lib/webhook-security";
import { logger } from "@/lib/logger";

type YooWebhookPayload = {
  event?: string;
  object?: {
    id?: string;
    status?: string;
    amount?: {
      value?: string;
      currency?: string;
    };
  };
};

function toRubInt(value: string | undefined) {
  const amount = Number(value ?? "0");
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount);
}

export async function POST(request: NextRequest) {
  try {
    const env = getEnv();
    const sourceIp = getRequestIp(request.headers);
    const ipAllowlistEnabled = process.env.YOOKASSA_WEBHOOK_IP_ALLOWLIST_ENABLED !== "false";

    if (ipAllowlistEnabled) {
      assertIpAllowed({
        ip: sourceIp,
        allowedRaw: process.env.YOOKASSA_WEBHOOK_ALLOWED_IPS ?? ""
      });
    }

    await assertRateLimit({
      key: `yookassa:${sourceIp || "unknown"}`,
      limitPerMinute: Number(process.env.YOOKASSA_WEBHOOK_RATE_LIMIT_RPM ?? "60")
    });

    const payload = (await request.json()) as YooWebhookPayload;
    const paymentId = payload?.object?.id;
    if (!paymentId) {
      return NextResponse.json({ error: "Missing payment id in webhook payload" }, { status: 400 });
    }

    // Проверка подлинности уведомления через сверку актуального статуса платежа в YooKassa.
    const verifiedPayment = await getYooKassaPayment(paymentId);
    const payloadStatus = payload?.object?.status;
    if (payloadStatus && payloadStatus !== verifiedPayment.status) {
      return NextResponse.json({ error: "Webhook status mismatch" }, { status: 400 });
    }

    if (payload.event === "payment.canceled" || verifiedPayment.status === "canceled") {
      await prisma.payment.updateMany({
        where: { providerPaymentId: paymentId },
        data: { status: "CANCELED" }
      });

      logger.info("yookassa_webhook_canceled", { paymentId, sourceIp });
      return NextResponse.json({ received: true, status: "canceled" });
    }

    if (payload.event !== "payment.succeeded" && verifiedPayment.status !== "succeeded") {
      return NextResponse.json({ received: true, status: verifiedPayment.status });
    }

    const planCode = verifiedPayment.metadata?.plan_code;
    if (!planCode) {
      throw new BillingError("В metadata платежа отсутствует plan_code", 400);
    }

    if (verifiedPayment.amount.currency !== "RUB") {
      throw new BillingError("Ожидается валюта RUB", 400);
    }

    const successfulAmountRub = toRubInt(verifiedPayment.amount.value);
    const activationResult = await activatePaymentAndSubscription({
      providerPaymentId: paymentId,
      successfulAmountRub,
      planCode,
      inviterBonusDays: env.REFERRAL_INVITER_BONUS_DAYS,
      invitedBonusDays: env.REFERRAL_INVITED_BONUS_DAYS
    });

    if (!activationResult.subscriptionId) {
      throw new BillingError("Для оплаченного платежа не найдена подписка", 500);
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id: activationResult.subscriptionId },
      include: {
        user: true
      }
    });
    if (!subscription) {
      throw new BillingError("Подписка не найдена после проведения платежа", 500);
    }

    const remnawaveResult = await syncRemnawaveSubscription({
      email: subscription.user.email,
      expiresAt: subscription.expiresAt,
      deviceLimit: subscription.deviceLimitSnapshot,
      internalSubscriptionId: subscription.id,
      remnawaveProfileId: subscription.remnawaveProfileId
    });

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        remnawaveProfileId: remnawaveResult.remnawaveUserUuid,
        remnawaveSubscription: remnawaveResult.subscriptionUrl
      }
    });

    logger.info("yookassa_webhook_succeeded", { paymentId, subscriptionId: subscription.id, sourceIp });
    return NextResponse.json({ received: true, status: "succeeded" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    const statusCode = error instanceof BillingError ? error.statusCode : 500;
    logger.error("yookassa_webhook_failed", error, { statusCode, route: "/api/webhooks/yookassa" });
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
