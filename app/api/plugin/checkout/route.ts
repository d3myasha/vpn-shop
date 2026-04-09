import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrCreateBotIdentityForUser } from "@/lib/bot-identity";
import { getBotPlans, isBotDbConfigured, BotDbAdapterError } from "@/lib/bot-db-adapter";
import { createBotCheckout, BotApiError } from "@/lib/bot-api";
import { logger } from "@/lib/logger";

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
  const contentType = request.headers.get("content-type") ?? "";
  const wantsRedirect = contentType.includes("application/x-www-form-urlencoded");
  const origin = getPublicOrigin(request);

  let input: z.infer<typeof checkoutInputSchema>;
  if (wantsRedirect) {
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

  if (!isBotDbConfigured()) {
    const message = "Bot backend integration is not configured";
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
            botUserId: true,
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

    const identity = await resolveOrCreateBotIdentityForUser({
      userId: user.id,
      telegramId,
    });
    const botUserId = identity?.botUserId ?? user.botIdentity?.botUserId ?? null;
    if (!botUserId) {
      throw new BotDbAdapterError("Не удалось определить botUserId для оплаты", 409);
    }

    const availablePlans = await getBotPlans();
    const selectedPlan = availablePlans.find((plan) => plan.publicCode === input.planCode);
    if (!selectedPlan) {
      throw new BotDbAdapterError("Тариф не найден в backend бота", 404);
    }

    const returnUrl = new URL("/account?tab=subscription", origin).toString();
    const checkout = await createBotCheckout({
      botUserId,
      planCode: selectedPlan.publicCode,
      promoCode: input.promoCode?.trim() || undefined,
      referralCode: input.referralCode?.trim().toUpperCase() || undefined,
      returnUrl,
      source: "vpn-shop-web",
    });

    if (wantsRedirect) {
      return NextResponse.redirect(checkout.checkoutUrl, 303);
    }

    return NextResponse.json({
      redirectUrl: checkout.checkoutUrl,
      mode: "browser_checkout",
    });
  } catch (error) {
    const statusCode =
      error instanceof BotDbAdapterError || error instanceof BotApiError ? error.statusCode : 502;
    logger.error("plugin_checkout_failed", error, { statusCode, route: "/api/plugin/checkout" });

    if (wantsRedirect) {
      return NextResponse.redirect(
        new URL(`/account?tab=subscription&error=${encodeURIComponent("Ошибка создания платежа")}`, origin),
        303,
      );
    }
    return NextResponse.json({ error: "Ошибка создания платежа" }, { status: statusCode });
  }
}
