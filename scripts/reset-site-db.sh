#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: command not found: $1"
    exit 1
  fi
}

need_cmd docker

echo "This will reset ONLY site stack database/volumes from current compose project."
echo "Bot stack is not touched."
read -r -p "Continue? [y/N]: " confirm
if [[ "${confirm:-}" != "y" && "${confirm:-}" != "Y" ]]; then
  echo "Cancelled."
  exit 0
fi

docker compose down --volumes --remove-orphans
docker compose up -d postgres redis
sleep 3
docker compose up -d app
docker compose exec app npm run prisma:deploy
docker compose exec app npm run prisma:seed

echo "OK: site DB has been reset and seeded."
echo "Tip: clear browser cookies for the site domain after reset."
