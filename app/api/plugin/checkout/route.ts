import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrCreateBotIdentityForUser } from "@/lib/bot-identity";
import { createBotCheckout, isRemnashopConfigured, RemnashopAdapterError } from "@/lib/remnashop-adapter";
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

  if (!isRemnashopConfigured()) {
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
      select: { id: true, email: true },
    });
    if (!user) {
      throw new RemnashopAdapterError("User not found", 404);
    }

    const identity = await resolveOrCreateBotIdentityForUser({
      userId: user.id,
      email: user.email,
    });

    if (!identity?.botUserId) {
      throw new RemnashopAdapterError("Bot identity is not linked for current user", 404);
    }

    const returnUrl = new URL("/account?tab=subscription", origin).toString();
    const checkout = await createBotCheckout({
      botUserId: identity.botUserId,
      planCode,
      promoCode: input.promoCode?.trim() || undefined,
      referralCode: input.referralCode?.trim() || undefined,
      returnUrl,
    });

    if (wantsRedirect) {
      return NextResponse.redirect(checkout.confirmationUrl, 303);
    }

    return NextResponse.json({ confirmationUrl: checkout.confirmationUrl });
  } catch (error) {
    const statusCode = error instanceof RemnashopAdapterError ? error.statusCode : 502;
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
