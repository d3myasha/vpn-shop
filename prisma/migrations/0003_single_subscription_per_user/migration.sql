-- Ensure one subscription per user.
-- Keep the most recently updated subscription, re-link payments, remove duplicates.

WITH ranked AS (
  SELECT
    "id",
    "userId",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn,
    FIRST_VALUE("id") OVER (
      PARTITION BY "userId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS keeper_id
  FROM "Subscription"
),
relinked AS (
  UPDATE "Payment" p
  SET "subscriptionId" = r.keeper_id
  FROM ranked r
  WHERE p."subscriptionId" = r."id"
    AND r.rn > 1
  RETURNING p."id"
)
DELETE FROM "Subscription" s
USING ranked r
WHERE s."id" = r."id"
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_key" ON "Subscription"("userId");
DROP INDEX IF EXISTS "Subscription_userId_status_idx";
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");
