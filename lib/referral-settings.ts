import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

export const REFERRAL_SETTINGS_ID = "default";

export async function getOrCreateReferralSettings() {
  const existing = await prisma.referralSettings.findUnique({
    where: { id: REFERRAL_SETTINGS_ID }
  });

  if (existing) {
    return existing;
  }

  const env = getEnv();
  return prisma.referralSettings.create({
    data: {
      id: REFERRAL_SETTINGS_ID,
      inviterBonusDays: env.REFERRAL_INVITER_BONUS_DAYS,
      invitedBonusDays: env.REFERRAL_INVITED_BONUS_DAYS
    }
  });
}
