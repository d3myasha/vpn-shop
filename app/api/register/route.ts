import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode, normalizeReferralCode, resolveReferralInviter } from "@/lib/users";
import { logger } from "@/lib/logger";
import { isEmailDomainAllowed } from "@/lib/email-policy";
import { verifyRegistrationCode } from "@/lib/email-verification";
import { resolveRoleForNewUser } from "@/lib/admin-role";
import { checkRateLimit } from "@/lib/rate-limit";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  referralCode: z.string().trim().toUpperCase().max(32).optional(),
  verificationCode: z.string().trim().length(6).optional(),
  legalAccepted: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 3 попытки регистрации в минуту на IP
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const rateLimitKey = `rate-limit:register:${clientIp}`;
    const isAllowed = await checkRateLimit({ key: rateLimitKey, limitPerMinute: 3 });
    
    if (!isAllowed) {
      return NextResponse.json(
        { error: "Слишком много попыток. Попробуйте позже" },
        { status: 429 }
      );
    }

    const body = (await request.json()) as unknown;
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Неверные данные регистрации" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    if (!isEmailDomainAllowed(email)) {
      return NextResponse.json({ error: "Разрешены только популярные почтовые сервисы" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
    }

    if (!parsed.data.legalAccepted) {
      return NextResponse.json({ error: "Для регистрации нужно принять условия и политику" }, { status: 400 });
    }

    const verificationCode = parsed.data.verificationCode?.trim();
    if (!verificationCode) {
      return NextResponse.json({ error: "Нужен код подтверждения из письма" }, { status: 400 });
    }

    const verification = await verifyRegistrationCode({ email, code: verificationCode });
    if (!verification.ok) {
      return NextResponse.json({ error: verification.reason }, { status: 400 });
    }

    const normalizedReferralCode = normalizeReferralCode(parsed.data.referralCode);
    const inviter = await resolveReferralInviter({ referralCode: normalizedReferralCode });
    const referredByUserId = inviter?.id ?? null;

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const referralCode = await generateUniqueReferralCode();

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        referralCode,
        referredByUserId,
        role: resolveRoleForNewUser({ email }),
      },
      select: {
        id: true,
        email: true
      }
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    logger.error("register_failed", error, { route: "/api/register" });
    return NextResponse.json({ error: "Ошибка регистрации" }, { status: 500 });
  }
}
