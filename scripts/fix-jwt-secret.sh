#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: command not found: $1"
    exit 1
  fi
}

need_cmd sed
need_cmd grep
need_cmd openssl

read_env_value() {
  local key="$1"
  local raw
  raw="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
  raw="${raw%\"}"
  raw="${raw#\"}"
  echo "$raw"
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=\"${value}\"|g" "$ENV_FILE"
  else
    printf '\n%s="%s"\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

AUTH_SECRET_VALUE="$(read_env_value AUTH_SECRET)"

if [[ -z "$AUTH_SECRET_VALUE" || "$AUTH_SECRET_VALUE" == "replace-with-random-secret" ]]; then
  AUTH_SECRET_VALUE="$(openssl rand -hex 32)"
fi

upsert_env_value AUTH_SECRET "$AUTH_SECRET_VALUE"
upsert_env_value NEXTAUTH_SECRET "$AUTH_SECRET_VALUE"

echo "OK: AUTH_SECRET and NEXTAUTH_SECRET are synchronized."
echo "Restart app to apply:"
echo "  docker compose up -d --force-recreate app"
