import { prisma } from "@/lib/prisma";

const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomReferralCode(length = 8) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)];
  }
  return code;
}

export function normalizeReferralCode(value?: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

export async function generateUniqueReferralCode() {
  for (let i = 0; i < 10; i += 1) {
    const code = randomReferralCode(8);
    const exists = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!exists) {
      return code;
    }
  }

  throw new Error("Не удалось сгенерировать уникальный реферальный код");
}

export async function resolveReferralInviter(params: {
  referralCode?: string | null;
  userId?: string | null;
  userReferralCode?: string | null;
}) {
  const referralCode = normalizeReferralCode(params.referralCode);
  if (!referralCode) {
    return null;
  }

  if (params.userReferralCode && referralCode === normalizeReferralCode(params.userReferralCode)) {
    return null;
  }

  const inviter = await prisma.user.findUnique({
    where: { referralCode },
    select: { id: true },
  });

  if (!inviter) {
    return null;
  }

  if (params.userId && inviter.id === params.userId) {
    return null;
  }

  return inviter;
}
