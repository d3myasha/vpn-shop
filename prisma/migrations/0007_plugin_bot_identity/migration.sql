-- Plugin storefront identity mapping for external bot backend.

CREATE TABLE "BotIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'remnashop',
  "botUserId" TEXT NOT NULL,
  "telegramId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BotIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotIdentity_userId_key" ON "BotIdentity"("userId");
CREATE UNIQUE INDEX "BotIdentity_telegramId_key" ON "BotIdentity"("telegramId");
CREATE UNIQUE INDEX "BotIdentity_provider_botUserId_key" ON "BotIdentity"("provider", "botUserId");

ALTER TABLE "BotIdentity"
  ADD CONSTRAINT "BotIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
