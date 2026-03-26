-- CreateTable
CREATE TABLE "ReferralSettings" (
    "id" TEXT NOT NULL,
    "inviterBonusDays" INTEGER NOT NULL,
    "invitedBonusDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralSettings_pkey" PRIMARY KEY ("id")
);
