#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_SEED="${RUN_SEED:-false}"
APP_PORT="${APP_PORT:-3001}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: command not found: $1" >&2
    exit 1
  fi
}

need_cmd docker
need_cmd git
need_cmd curl

echo "Sync code with origin/main..."
git fetch --all
git reset --hard origin/main

echo "Pull app image..."
docker compose pull app

echo "Recreate app..."
docker compose up -d --force-recreate app

echo "Run migrations..."
docker compose exec app npm run prisma:deploy

if [[ "$RUN_SEED" == "true" ]]; then
  echo "Run seed..."
  docker compose exec app npm run prisma:seed
fi

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
