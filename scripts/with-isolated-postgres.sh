#!/usr/bin/env bash
set -euo pipefail

# Run the server and command in one process/network namespace. Never read .env,
# reuse PGDATA, or connect to an existing PostgreSQL server.
if [[ $# -eq 0 ]]; then
  echo "Usage: PG_BIN_DIR=/path/to/postgres16/bin bash scripts/with-isolated-postgres.sh <command> [args...]" >&2
  exit 2
fi
PG_BIN_DIR="${PG_BIN_DIR:-$(dirname "$(command -v postgres || echo /missing/postgres)")}"
for binary in postgres initdb pg_ctl createdb psql; do
  [[ -x "$PG_BIN_DIR/$binary" ]] || { echo "Missing PostgreSQL 16 binary: $PG_BIN_DIR/$binary" >&2; exit 2; }
done
[[ "$("$PG_BIN_DIR/postgres" --version)" == *" 16."* ]] || { echo "PostgreSQL 16 is required" >&2; exit 2; }

root="$(mktemp -d "${TMPDIR:-/tmp}/site-isolated-postgres.XXXXXXXX")"
cleanup() {
  local status=$?
  trap - EXIT
  "$PG_BIN_DIR/pg_ctl" -D "$root/data" -m fast -w stop >/dev/null 2>&1 || true
  if [[ "$status" != 0 ]]; then
    echo "Isolated PostgreSQL log (test-only data):" >&2
    tail -40 "$root/server.log" >&2 2>/dev/null || true
  fi
  rm -rf -- "$root"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# libpq and pg must not inherit connection destinations, services, or options.
for variable in ${!PG@}; do
  [[ "$variable" == PG_BIN_DIR ]] || unset "$variable"
done
unset DATABASE_URL DIRECT_URL
"$PG_BIN_DIR/initdb" -D "$root/data" --username=site_test_admin \
  --auth-local=trust --auth-host=trust --no-locale --encoding=UTF8 >"$root/initdb.log"
# Port zero allocation is handled by the kernel for a temporary probe. A race
# fails closed at startup; it never falls back to connecting to another server.
port="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
"$PG_BIN_DIR/pg_ctl" -D "$root/data" -l "$root/server.log" \
  -o "-h 127.0.0.1 -p $port -c unix_socket_directories=''" -w start
for suite in base daily inbox questions blog oauth gateway documents domain; do
  "$PG_BIN_DIR/createdb" -h 127.0.0.1 -p "$port" -U site_test_admin "site_test_$suite"
done
base="postgresql://site_test_admin@127.0.0.1:$port"
export DATABASE_URL="$base/site_test_base"
export DAILY_INTEGRATION_TEST_DATABASE_URL="$base/site_test_daily"
export INBOX_TEST_DATABASE_URL="$base/site_test_inbox"
export QUESTION_TEST_DATABASE_URL="$base/site_test_questions?schema=question_test_isolated"
export BLOG_SERIES_TEST_DATABASE_URL="$base/site_test_blog?schema=blog_series_test_isolated"
export MCP_OAUTH_TEST_DATABASE_URL="$base/site_test_oauth"
export MCP_GATEWAY_TEST_DATABASE_URL="$base/site_test_gateway"
export SERVER_DOMAIN_TEST_DATABASE_URL="$base/site_test_domain"
export DOCUMENT_TEST_DATABASE_URL="$base/site_test_documents?schema=document_test_isolated"
export DAILY_TEST_DATABASE_URL="$base/site_test_daily?schema=daily_test_isolated_run"
export NEXT_TELEMETRY_DISABLED=1
"$PG_BIN_DIR/psql" "$DATABASE_URL" -Atc \
  "SELECT version(), inet_server_addr(), inet_server_port(), current_database();"
"$@"
