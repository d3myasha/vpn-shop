import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isEmailDomainAllowed } from "@/lib/email-policy";
import { sendRegistrationVerificationCode } from "@/lib/email-verification";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const requestCodeSchema = z.object({
  email: z.string().email(),
  legalAccepted: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;
    const parsed = requestCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    if (!isEmailDomainAllowed(email)) {
      return NextResponse.json({ error: "Разрешены только популярные почтовые сервисы" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ exists: true }, { status: 200 });
    }

    if (!parsed.data.legalAccepted) {
      return NextResponse.json({ error: "Для регистрации нужно принять условия и политику" }, { status: 400 });
    }

    await sendRegistrationVerificationCode(email);
    return NextResponse.json({ exists: false, sent: true }, { status: 200 });
  } catch (error) {
    logger.error("request_register_code_failed", error, { route: "/api/register/request-code" });
    const message = error instanceof Error ? error.message : "Ошибка отправки кода";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
