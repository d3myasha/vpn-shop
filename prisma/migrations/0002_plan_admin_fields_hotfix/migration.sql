-- Hotfix migration for installations that had legacy Plan schema without admin fields.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanLimitType') THEN
    CREATE TYPE "PlanLimitType" AS ENUM ('DEVICES', 'TRAFFIC');
  END IF;
END
$$;

ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'CUSTOM';

ALTER TABLE "Plan"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "limitType" "PlanLimitType" NOT NULL DEFAULT 'DEVICES',
  ADD COLUMN IF NOT EXISTS "trafficLimitGb" INTEGER,
  ADD COLUMN IF NOT EXISTS "internalSquadUuid" TEXT,
  ADD COLUMN IF NOT EXISTS "externalSquadUuid" TEXT;
