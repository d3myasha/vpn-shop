import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { activatePaymentAndSubscription, BillingError } from "@/lib/billing";
import { getYooKassaPayment } from "@/lib/yookassa";

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
    const env = getEnv();
    await activatePaymentAndSubscription({
      providerPaymentId: paymentId,
      successfulAmountRub,
      planCode,
      inviterBonusDays: env.REFERRAL_INVITER_BONUS_DAYS,
      invitedBonusDays: env.REFERRAL_INVITED_BONUS_DAYS
    });

    return NextResponse.json({ received: true, status: "succeeded" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    const statusCode = error instanceof BillingError ? error.statusCode : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
