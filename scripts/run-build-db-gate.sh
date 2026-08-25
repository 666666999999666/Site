#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

gate_root="$(mktemp -d /tmp/qzsite-pg16-gate.XXXXXX)"
pg_data="$gate_root/data"
pg_socket="$gate_root/socket"
pg_log="$gate_root/postgres.log"
pg_port=55432
database_name=qzsite_test
postgres_url="postgresql://postgres@127.0.0.1:${pg_port}/${database_name}"
database_url="${postgres_url}?schema=public"
blog_series_database_url="${postgres_url}?schema=blog_series_test_build"
question_database_url="${postgres_url}?schema=question_test_build"

cleanup() {
  set +e
  if [[ -s "$pg_data/postmaster.pid" ]]; then
    su-exec postgres pg_ctl -D "$pg_data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  case "$gate_root" in
    /tmp/qzsite-pg16-gate.*) rm -rf -- "$gate_root" ;;
    *) printf 'Refusing to remove an unexpected database gate path\n' >&2 ;;
  esac
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

postgres --version | grep -Eq '^postgres \(PostgreSQL\) 16\.' \
  || {
    printf 'The build database gate requires PostgreSQL 16\n' >&2
    exit 1
  }

chown postgres:postgres "$gate_root"
install -d -m 700 -o postgres -g postgres "$pg_data" "$pg_socket"
su-exec postgres initdb \
  --pgdata "$pg_data" \
  --username postgres \
  --encoding UTF8 \
  --no-locale \
  --auth-local trust \
  --auth-host trust > /dev/null
su-exec postgres pg_ctl \
  --pgdata "$pg_data" \
  --log "$pg_log" \
  --options "-F -h 127.0.0.1 -p $pg_port -k $pg_socket" \
  --wait start > /dev/null
su-exec postgres createdb --host "$pg_socket" --port "$pg_port" "$database_name"

export DATABASE_URL="$database_url"
export BLOG_SERIES_TEST_DATABASE_URL="$blog_series_database_url"
export QUESTION_TEST_DATABASE_URL="$question_database_url"
export MCP_OAUTH_TEST_DATABASE_URL="$database_url"
export SESSION_SECRET="build-db-gate-session-secret-2026-08-25"
export NEXT_PUBLIC_SITE_URL="http://127.0.0.1:3000"
export NODE_ENV="test"

printf 'Running empty PostgreSQL 16 migration gate\n'
run_runtime_prisma_migration() {
  DATABASE_URL="${1:-$database_url}" NODE_PATH=/prisma/node_modules \
    node /prisma/node_modules/prisma/build/index.js migrate deploy
}
run_runtime_prisma_migration
run_runtime_prisma_migration
pending_migrations="$(
  psql "$postgres_url" --no-psqlrc --tuples-only --no-align --command \
    'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NULL OR "rolled_back_at" IS NOT NULL;'
)"
[[ "$pending_migrations" == "0" ]] \
  || {
    printf 'Migration gate found incomplete or rolled-back migrations: %s\n' "$pending_migrations" >&2
    exit 1
  }

printf 'Running Series PostgreSQL integration gate\n'
npm run test:blog-series:integration
printf 'Running Questions PostgreSQL integration gate\n'
run_runtime_prisma_migration "$question_database_url"
npm run test:questions:integration
printf 'Running Inbox PostgreSQL integration gate\n'
npm run test:inbox:integration
printf 'Running OAuth DCR/PKCE/resource/refresh/revoke integration gate\n'
npm run test:mcp:oauth

printf 'PostgreSQL 16 build database gate passed\n'
