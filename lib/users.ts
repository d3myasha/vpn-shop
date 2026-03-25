import { prisma } from "@/lib/prisma";

const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomReferralCode(length = 8) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)];
  }
  return code;
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
