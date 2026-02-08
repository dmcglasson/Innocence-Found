#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="${ROOT_DIR}/supabase/worksheets.sql"

if [[ ! -f "${SQL_FILE}" ]]; then
  echo "SQL file not found: ${SQL_FILE}" >&2
  exit 1
fi

DB_URL="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"
if [[ -z "${DB_URL}" ]]; then
  echo "Missing DB connection string." >&2
  echo "Set SUPABASE_DB_URL or DATABASE_URL to your Supabase Postgres URL." >&2
  exit 1
fi

echo "Running ${SQL_FILE}..."
psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${SQL_FILE}"
echo "Done."
