import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { verifyRegistrationCode } from "@/lib/email-verification";
import { resolvePromotedRole } from "@/lib/admin-role";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting: 5 попыток в минуту на пользователя
    const rateLimitKey = `rate-limit:link-email-confirm:${session.user.id}`;
    const isAllowed = await checkRateLimit({ key: rateLimitKey, limitPerMinute: 5 });
    
    if (!isAllowed) {
      return NextResponse.json(
        { error: "Слишком много попыток. Попробуйте позже" },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      code?: string;
      password?: string;
    };
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();
    const password = String(body.password ?? "");

    if (!email || !code || !password) {
      return NextResponse.json({ error: "Email, код и пароль обязательны" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Пароль должен быть не короче 8 символов" }, { status: 400 });
    }

    const actor = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        botIdentity: { select: { telegramId: true } },
      },
    });
    if (!actor) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const emailOwner = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailOwner && emailOwner.id !== actor.id) {
      return NextResponse.json({ error: "Этот email уже привязан к другому аккаунту" }, { status: 409 });
    }

    const verification = await verifyRegistrationCode({ email, code });
    if (!verification.ok) {
      return NextResponse.json({ error: verification.reason }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const promotedRole = resolvePromotedRole(actor.role, {
      email,
      telegramId: actor.botIdentity?.telegramId ?? null,
    });

    await prisma.user.update({
      where: { id: actor.id },
      data: {
        email,
        passwordHash,
        role: promotedRole,
      },
    });

    return NextResponse.json({ ok: true, linked: true });
  } catch (error) {
    logger.error("account_link_email_confirm_failed", error, { route: "/api/account/link-email/confirm" });
    return NextResponse.json({ error: "Не удалось привязать email" }, { status: 500 });
  }
}
