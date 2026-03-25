-- Keep subscriptions when a plan is deleted from shop.
-- Subscription.planId becomes nullable and FK action changes to SET NULL.

ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_planId_fkey";
ALTER TABLE "Subscription" ALTER COLUMN "planId" DROP NOT NULL;
ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
