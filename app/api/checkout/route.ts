import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { calculateDiscountRub, resolveCheckoutUser, validatePromoCode, BillingError } from "@/lib/billing";
import { createYooKassaPayment } from "@/lib/yookassa";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { normalizeReferralCode, resolveReferralInviter } from "@/lib/users";

const checkoutInputSchema = z.object({
  planCode: z.string().trim().min(1).max(64),
  promoCode: z.string().trim().max(64).optional(),
  referralCode: z.string().trim().max(32).optional(),
});

const ALLOWED_HOSTS = new Set([
  process.env.APP_DOMAIN,
  process.env.NEXT_PUBLIC_APP_DOMAIN,
].filter(Boolean));

function getPublicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  // Валидация x-forwarded-host для предотвращения Host Header Injection
  if (forwardedHost) {
    if (ALLOWED_HOSTS.size > 0 && !ALLOWED_HOSTS.has(forwardedHost)) {
      logger.warn("host_header_injection_blocked", { forwardedHost, allowedHosts: [...ALLOWED_HOSTS] });
      return request.nextUrl.origin;
    }
    const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
    return `${proto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const checkoutEnabled = process.env.CHECKOUT_ENABLED !== "false";
  const contentType = request.headers.get("content-type") ?? "";
  const wantsRedirect = contentType.includes("application/x-www-form-urlencoded");
  const origin = getPublicOrigin(request);

  let input: z.infer<typeof checkoutInputSchema>;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    const parseResult = checkoutInputSchema.safeParse({
      planCode: formData.get("planCode") ?? "",
      promoCode: formData.get("promoCode") ?? undefined,
      referralCode: formData.get("referralCode") ?? undefined,
    });
    if (!parseResult.success) {
      return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
    }
    input = parseResult.data;
  } else {
    const body = await request.json();
    const parseResult = checkoutInputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
    }
    input = parseResult.data;
  }

  if (!checkoutEnabled) {
    if (wantsRedirect) {
      return NextResponse.redirect(new URL("/account?tab=subscription&checkout=disabled", origin), 303);
    }
    return NextResponse.json({ error: "Покупка и оплата временно недоступна" }, { status: 503 });
  }

  try {
    const [plan, promo] = await Promise.all([
      prisma.plan.findUnique({ where: { code: input.planCode } }),
      validatePromoCode(input.promoCode)
    ]);

    if (!plan || !plan.isActive) {
      throw new BillingError("План не найден или отключен", 404);
    }

    const session = await auth();
    if (!session?.user?.id) {
      if (wantsRedirect) {
        return NextResponse.redirect(
          new URL(`/login?next=${encodeURIComponent("/account?tab=subscription")}`, origin),
          303
        );
      }
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }

    const user = await resolveCheckoutUser(session.user.id);

    const normalizedReferralCode = normalizeReferralCode(input.referralCode);
    if (normalizedReferralCode && !user.referredByUserId) {
      const inviter = await resolveReferralInviter({
        referralCode: normalizedReferralCode,
        userId: user.id,
        userReferralCode: user.referralCode,
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
    const returnUrl = new URL("/account", origin).toString();
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
    const statusCode = error instanceof BillingError ? error.statusCode : 500;
    logger.error("checkout_failed", error, { statusCode, planCode: input.planCode, route: "/api/checkout" });

    if (wantsRedirect) {
      return NextResponse.redirect(
        new URL(`/account?tab=subscription&error=${encodeURIComponent("Ошибка создания платежа")}`, origin),
        303
      );
    }

    return NextResponse.json({ error: "Ошибка создания платежа" }, { status: statusCode });
  }
}
