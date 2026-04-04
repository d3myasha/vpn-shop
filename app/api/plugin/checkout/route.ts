import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrCreateBotIdentityForUser } from "@/lib/bot-identity";
import { BotDbAdapterError } from "@/lib/bot-db-adapter";
import { createStorefrontCheckout, isBotApiConfigured, BotApiError } from "@/lib/bot-api";
import { logger } from "@/lib/logger";

type CheckoutInput = {
  planCode?: string;
  promoCode?: string;
  referralCode?: string;
};

function getPublicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  const wantsRedirect = contentType.includes("application/x-www-form-urlencoded");
  const origin = getPublicOrigin(request);

  let input: CheckoutInput = {};
  if (wantsRedirect) {
    const formData = await request.formData();
    input = {
      planCode: String(formData.get("planCode") ?? ""),
      promoCode: String(formData.get("promoCode") ?? ""),
      referralCode: String(formData.get("referralCode") ?? ""),
    };
  } else {
    input = (await request.json()) as CheckoutInput;
  }

  const planCode = String(input.planCode ?? "").trim();
  if (!planCode) {
    return NextResponse.json({ error: "planCode is required" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    if (wantsRedirect) {
      return NextResponse.redirect(
        new URL(`/login?next=${encodeURIComponent("/account?tab=subscription")}`, origin),
        303,
      );
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isBotApiConfigured()) {
    const message = "Bot API integration is not configured";
    if (wantsRedirect) {
      return NextResponse.redirect(
        new URL(`/account?tab=subscription&error=${encodeURIComponent(message)}`, origin),
        303,
      );
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        botIdentity: {
          select: {
            telegramId: true,
          },
        },
      },
    });
    if (!user) {
      throw new BotDbAdapterError("User not found", 404);
    }

    const telegramId = user.botIdentity?.telegramId;
    if (!telegramId) {
      throw new BotDbAdapterError("Сначала привяжите Telegram-аккаунт к профилю", 409);
    }

    await resolveOrCreateBotIdentityForUser({
      userId: user.id,
      telegramId,
    });

    const checkout = await createStorefrontCheckout({
      telegramId,
      planCode,
      promoCode: input.promoCode?.trim() || undefined,
      referralCode: input.referralCode?.trim().toUpperCase() || undefined,
      returnUrl: `${origin}/account?tab=subscription`,
      source: "vpn-shop-web",
    });

    if (wantsRedirect) {
      return NextResponse.redirect(checkout.checkoutUrl, 303);
    }

    return NextResponse.json({
      redirectUrl: checkout.checkoutUrl,
      mode: "browser_checkout",
      paymentId: checkout.paymentId,
      expiresAt: checkout.expiresAt ?? null,
    });
  } catch (error) {
    const statusCode =
      error instanceof BotDbAdapterError || error instanceof BotApiError ? error.statusCode : 502;
    const message = error instanceof Error ? error.message : "Checkout failed";
    logger.error("plugin_checkout_failed", error, { statusCode, route: "/api/plugin/checkout" });

    if (wantsRedirect) {
      return NextResponse.redirect(
        new URL(`/account?tab=subscription&error=${encodeURIComponent(message)}`, origin),
        303,
      );
    }
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
