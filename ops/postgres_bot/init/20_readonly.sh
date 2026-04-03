#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${BOT_DB_NAME:-${POSTGRES_DB}}"
RO_USER="${BOT_DB_READONLY_USER:-shop_ro}"
RO_PASS="${BOT_DB_READONLY_PASSWORD:-shop_ro_pass}"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${DB_NAME}" <<SQL
DO
\$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RO_USER}') THEN
    CREATE ROLE ${RO_USER} LOGIN PASSWORD '${RO_PASS}';
  ELSE
    ALTER ROLE ${RO_USER} LOGIN PASSWORD '${RO_PASS}';
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE ${DB_NAME} TO ${RO_USER};
GRANT USAGE ON SCHEMA public TO ${RO_USER};
GRANT SELECT ON TABLE users, subscriptions, transactions, plans, plan_durations, plan_prices TO ${RO_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${RO_USER};
SQL
