import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isEmailDomainAllowed } from "@/lib/email-policy";
import { sendEmailLinkVerificationCode } from "@/lib/email-verification";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email обязателен" }, { status: 400 });
    }

    if (!isEmailDomainAllowed(email)) {
      return NextResponse.json({ error: "Разрешены только популярные почтовые сервисы" }, { status: 400 });
    }

    const actor = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true },
    });
    if (!actor) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const existingEmailOwner = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingEmailOwner && existingEmailOwner.id !== actor.id) {
      return NextResponse.json({ error: "Этот email уже привязан к другому аккаунту" }, { status: 409 });
    }

    await sendEmailLinkVerificationCode(email);
    return NextResponse.json({ ok: true, sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить код";
    logger.error("account_link_email_request_code_failed", error, { route: "/api/account/link-email/request-code" });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
