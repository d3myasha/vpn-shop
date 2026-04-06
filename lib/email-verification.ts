import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationCodeEmail } from "@/lib/mailer";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export async function sendRegistrationVerificationCode(email: string) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return { exists: true as const };
  }

  const code = generateCode();
  await createAndSendVerificationCode(email, code);
  return { exists: false as const };
}

export async function sendEmailLinkVerificationCode(email: string) {
  const code = generateCode();
  await createAndSendVerificationCode(email, code);
}

export async function verifyRegistrationCode(params: { email: string; code: string }) {
  const now = new Date();
  const latestCode = await prisma.emailVerificationCode.findFirst({
    where: {
      email: params.email,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!latestCode) {
    return { ok: false as const, reason: "Код не найден или истек. Запросите новый код." };
  }

  if (latestCode.attempts >= MAX_ATTEMPTS) {
    return { ok: false as const, reason: "Превышено число попыток. Запросите новый код." };
  }

  const inputHash = hashCode(params.code.trim());
  if (inputHash !== latestCode.codeHash) {
    await prisma.emailVerificationCode.update({
      where: { id: latestCode.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false as const, reason: "Неверный код подтверждения." };
  }

  await prisma.emailVerificationCode.update({
    where: { id: latestCode.id },
    data: { consumedAt: now },
  });

  return { ok: true as const };
}

async function createAndSendVerificationCode(email: string, code: string) {
  const codeHash = hashCode(code);
  const now = new Date();
  const expiresAt = addMinutes(now, CODE_TTL_MINUTES);

  await prisma.emailVerificationCode.create({
    data: {
      email,
      codeHash,
      expiresAt,
    },
  });

  await sendVerificationCodeEmail({ email, code });
}
