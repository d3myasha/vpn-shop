#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[cleanup-legacy-telegram-local-emails] Nullifying synthetic telegram.local emails for Telegram-linked users..."

docker compose exec -T postgres psql -U vpn_user -d vpn_shop <<'SQL'
UPDATE "User" u
SET "email" = NULL,
    "updatedAt" = NOW()
FROM "BotIdentity" bi
WHERE bi."userId" = u."id"
  AND bi."telegramId" IS NOT NULL
  AND u."email" ~ '^tg-[0-9]+(-[a-f0-9]{8})?@telegram\.local$';
SQL

echo "[cleanup-legacy-telegram-local-emails] Done."
