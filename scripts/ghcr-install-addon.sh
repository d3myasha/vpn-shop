#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_IMAGE="${APP_IMAGE:-ghcr.io/d3myasha/vpn-shop:latest}"
APP_PORT="${APP_PORT:-3001}"

required_vars=(
  DATABASE_URL
  AUTH_SECRET
  NEXTAUTH_SECRET
  NEXTAUTH_URL
  TELEGRAM_BOT_TOKEN
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  REMNASHOP_DATABASE_URL
  REMNASHOP_API_BASE_URL
  REMNASHOP_API_TOKEN
)

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: command not found: $1" >&2
    exit 1
  fi
}

need_cmd docker
need_cmd sed

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Создан .env из .env.example"
  echo "Заполни .env и запусти скрипт снова:"
  echo "  bash scripts/ghcr-install-addon.sh"
  exit 1
fi

set -a
source .env
set +a

missing=()
for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    missing+=("$v")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "ERROR: в .env не заполнены обязательные переменные:"
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi

cat > docker-compose.override.yml <<YAML
services:
  app:
    image: ${APP_IMAGE}
    build: null
    ports:
      - "${APP_PORT}:3000"
YAML

echo "Сформирован docker-compose.override.yml (app -> ${APP_IMAGE}, port ${APP_PORT})"

echo "Pull images..."
docker compose pull

echo "Start stack..."
docker compose up -d

echo "Run migrations..."
docker compose exec app npm run prisma:deploy

echo "Run seed..."
docker compose exec app npm run prisma:seed

echo "Health check..."
for _ in {1..20}; do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo "OK: app is healthy at http://127.0.0.1:${APP_PORT}/api/health"
    exit 0
  fi
  sleep 2
done

echo "ERROR: health check failed. See logs:"
echo "  docker compose logs --tail=200 app"
exit 1
