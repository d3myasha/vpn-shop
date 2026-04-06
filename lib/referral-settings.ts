import { prisma } from "@/lib/prisma";
import { getBaseEnv } from "@/lib/env";
import { Prisma } from "@prisma/client";

export const REFERRAL_SETTINGS_ID = "default";

function isMissingReferralSettingsTable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021" &&
    typeof error.meta?.table === "string" &&
    error.meta.table.includes("ReferralSettings")
  );
}

export async function getOrCreateReferralSettings() {
  const env = getBaseEnv();
  try {
    const existing = await prisma.referralSettings.findUnique({
      where: { id: REFERRAL_SETTINGS_ID }
    });

    if (existing) {
      return existing;
    }

    return await prisma.referralSettings.create({
      data: {
        id: REFERRAL_SETTINGS_ID,
        inviterBonusDays: env.REFERRAL_INVITER_BONUS_DAYS,
        invitedBonusDays: env.REFERRAL_INVITED_BONUS_DAYS
      }
    });
  } catch (error) {
    if (isMissingReferralSettingsTable(error)) {
      // Fallback for nodes where migration has not been applied yet.
      return {
        id: REFERRAL_SETTINGS_ID,
        inviterBonusDays: env.REFERRAL_INVITER_BONUS_DAYS,
        invitedBonusDays: env.REFERRAL_INVITED_BONUS_DAYS,
        createdAt: new Date(0),
        updatedAt: new Date(0)
      };
    }

    throw error;
  }
}
