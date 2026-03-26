import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateDiscountRub, resolveCheckoutUser, validatePromoCode, BillingError } from "@/lib/billing";
import { createYooKassaPayment } from "@/lib/yookassa";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";

type CheckoutInput = {
  planCode?: string;
  promoCode?: string;
  referralCode?: string;
};

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  let input: CheckoutInput = {};
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    input = {
      planCode: String(formData.get("planCode") ?? ""),
      promoCode: String(formData.get("promoCode") ?? ""),
      referralCode: String(formData.get("referralCode") ?? "")
    };
  } else {
    input = (await request.json()) as CheckoutInput;
  }

  const planCode = String(input.planCode ?? "").trim();
  if (!planCode) {
    return NextResponse.json({ error: "planCode is required" }, { status: 400 });
  }

  const wantsRedirect = contentType.includes("application/x-www-form-urlencoded");

  try {
    const [plan, promo] = await Promise.all([
      prisma.plan.findUnique({ where: { code: planCode } }),
      validatePromoCode(input.promoCode)
    ]);

    if (!plan || !plan.isActive) {
      throw new BillingError("План не найден или отключен", 404);
    }

    const session = await auth();
    if (!session?.user?.id) {
      if (wantsRedirect) {
        return NextResponse.redirect(new URL("/login", request.url), 303);
      }
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }

    const user = await resolveCheckoutUser(session.user.id);

    if (input.referralCode && !user.referredByUserId && input.referralCode !== user.referralCode) {
      const inviter = await prisma.user.findUnique({
        where: { referralCode: input.referralCode.trim().toUpperCase() }
      });
      if (inviter) {
        await prisma.user.update({
          where: { id: user.id },
          data: { referredByUserId: inviter.id }
        });
      }
    }

    const discountRub = calculateDiscountRub(plan.priceRub, promo);
    const amountRub = plan.priceRub - discountRub;

    const idempotenceKey = crypto.randomUUID();
    const returnUrl = new URL("/account", request.url).toString();
    const pending = await prisma.payment.create({
      data: {
        userId: user.id,
        amountRub,
        status: "PENDING",
        provider: "yookassa",
        providerIdempotence: idempotenceKey,
        promoCodeId: promo?.id,
        discountRub
      }
    });

    const yooPayment = await createYooKassaPayment({
      amountRub,
      idempotenceKey,
      description: `VPN ${plan.title}`,
      returnUrl,
      metadata: {
        payment_id: pending.id,
        user_id: user.id,
        plan_code: plan.code
      }
    });

    await prisma.payment.update({
      where: { id: pending.id },
      data: {
        providerPaymentId: yooPayment.id
      }
    });

    const confirmationUrl = yooPayment.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      throw new BillingError("YooKassa не вернула confirmation_url", 502);
    }

    if (wantsRedirect) {
      return NextResponse.redirect(confirmationUrl, 303);
    }

    return NextResponse.json({
      paymentId: pending.id,
      yookassaPaymentId: yooPayment.id,
      confirmationUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout error";
    const statusCode = error instanceof BillingError ? error.statusCode : 500;
    logger.error("checkout_failed", error, { statusCode, planCode, route: "/api/checkout" });

    if (wantsRedirect) {
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(message)}`, request.url), 303);
    }

    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
