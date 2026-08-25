#!/usr/bin/env bash

source "${QZSITE_OPS_COMMON:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh}"

candidate_image="${1:-}"
backup_dump="${2:-}"
target_commit="${3:-}"
pg_image="postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777"
gate_label="qzsite.predeploy-migration-gate=true"

[[ "$candidate_image" =~ ^ccr\.ccs\.tencentyun\.com/lqzzql/web@sha256:[0-9a-f]{64}$ ]] \
  || fail "Candidate migration gate requires an immutable Web image"
[[ "$target_commit" =~ ^[0-9a-f]{40}$ ]] \
  || fail "Candidate migration gate requires a full Git SHA"
[[ -f "$backup_dump" && ! -L "$backup_dump" ]] \
  || fail "Candidate migration gate requires a real backup dump"
docker image inspect "$candidate_image" > /dev/null
docker image inspect "$pg_image" > /dev/null \
  || fail "Pinned PostgreSQL 16 image is unavailable locally"

# A SIGKILL can leave only resources carrying this dedicated label.  The global
# deployment lock prevents a concurrent legitimate gate, so the next run can
# safely remove those exact leftovers before creating its own resources.
while IFS= read -r stale_container; do
  [[ -z "$stale_container" ]] || docker rm --force "$stale_container" > /dev/null
done < <(docker ps --all --quiet --filter "label=$gate_label")
while IFS= read -r stale_network; do
  [[ -z "$stale_network" ]] || docker network rm "$stale_network" > /dev/null
done < <(docker network ls --quiet --filter "label=$gate_label")

suffix="${target_commit:0:8}-$$"
network="qzsite-migration-gate-$suffix"
pg_container="qzsite-migration-db-$suffix"
migration_container="qzsite-migration-app-$suffix"
db_name=qzsite_copy_test
db_user=qzsite_gate
db_password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
database_url="postgresql://${db_user}:${db_password}@${pg_container}:5432/${db_name}?schema=public"

cleanup() {
  set +e
  docker rm --force "$migration_container" > /dev/null 2>&1 || true
  docker rm --force "$pg_container" > /dev/null 2>&1 || true
  docker network rm "$network" > /dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

docker network create --internal --label "$gate_label" "$network" > /dev/null
docker run --detach --pull never \
  --name "$pg_container" \
  --label "$gate_label" \
  --network "$network" \
  --memory 256m \
  --memory-swap 256m \
  --cpus 0.75 \
  --pids-limit 256 \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=256m \
  --env POSTGRES_DB="$db_name" \
  --env POSTGRES_USER="$db_user" \
  --env POSTGRES_PASSWORD="$db_password" \
  "$pg_image" > /dev/null

ready=0
for _ in {1..60}; do
  if docker exec --env PGPASSWORD="$db_password" "$pg_container" \
    psql --host 127.0.0.1 --username "$db_user" --dbname "$db_name" \
      --no-psqlrc --tuples-only --no-align --command 'SELECT 1' 2>/dev/null \
      | grep -qx 1; then
    ready=1
    break
  fi
  sleep 1
done
((ready == 1)) || fail "Candidate migration PostgreSQL did not become ready"

log "Restoring the pre-deployment backup into an isolated PostgreSQL 16 container"
timeout 300 docker exec --interactive --env PGPASSWORD="$db_password" "$pg_container" \
  pg_restore --username "$db_user" --dbname "$db_name" --no-owner --no-acl \
  < "$backup_dump"

protected_counts() {
  docker exec --env PGPASSWORD="$db_password" "$pg_container" \
    psql --host 127.0.0.1 --username "$db_user" --dbname "$db_name" \
      --no-psqlrc --tuples-only --no-align --command '
        SELECT json_build_object(
          '\''posts'\'', (SELECT count(*) FROM "Post"),
          '\''drafts'\'', (SELECT count(*) FROM "Post" WHERE "status" = '\''DRAFT'\''),
          '\''projects'\'', (SELECT count(*) FROM "Project"),
          '\''todos'\'', (SELECT count(*) FROM "Todo"),
          '\''ideas'\'', (SELECT count(*) FROM "Idea"),
          '\''quotes'\'', (SELECT count(*) FROM "daily_quotes"),
          '\''sessions'\'', (SELECT count(*) FROM "Session"),
          '\''oauthClients'\'', (SELECT count(*) FROM "OauthClient"),
          '\''oauthRefreshTokens'\'', (SELECT count(*) FROM "OauthRefreshToken"),
          '\''oauthAccessTokens'\'', (SELECT count(*) FROM "OauthAccessToken"),
          '\''oauthConsents'\'', (SELECT count(*) FROM "OauthConsent"),
          '\''mcpCredentials'\'', (SELECT count(*) FROM "McpCredential"),
          '\''mcpAuditLogs'\'', (SELECT count(*) FROM "McpAuditLog")
        )::text;
      '
}

before_counts="$(protected_counts)"

run_candidate_migration() {
  timeout 300 docker run --rm --pull never \
    --name "$migration_container" \
    --label "$gate_label" \
    --network "$network" \
    --read-only \
    --memory 384m \
    --memory-swap 384m \
    --cpus 1.0 \
    --pids-limit 256 \
    --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m \
    --env DATABASE_URL="$database_url" \
    --entrypoint sh \
    "$candidate_image" -ceu '
      cd /app
      export NODE_PATH=/prisma/node_modules
      exec node /prisma/node_modules/prisma/build/index.js migrate deploy
    '
}

log "Applying candidate migrations twice to prove compatibility and idempotency"
run_candidate_migration
run_candidate_migration

incomplete_migrations="$(
  docker exec --env PGPASSWORD="$db_password" "$pg_container" \
    psql --host 127.0.0.1 --username "$db_user" --dbname "$db_name" \
      --no-psqlrc --tuples-only --no-align --command \
      'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NULL OR "rolled_back_at" IS NOT NULL;'
)"
[[ "$incomplete_migrations" == "0" ]] \
  || fail "Candidate migration left incomplete Prisma migrations"

after_counts="$(protected_counts)"
[[ "$after_counts" == "$before_counts" ]] \
  || fail "Candidate migration changed protected production row counts"

log "Candidate migration passed against the isolated production backup copy"
