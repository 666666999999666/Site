#!/usr/bin/env bash

source "${QZSITE_OPS_COMMON:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh}"

registry_repository="ccr.ccs.tencentyun.com/lqzzql/web"
state_file="$APP_DIR/.deploy-state"
require_file "$state_file"
read -r state_commit state_image state_fingerprint extra < "$state_file"

[[ -z "${extra:-}" ]] || fail "Deployment state contains unexpected fields"
[[ "$state_commit" =~ ^[0-9a-f]{40}$ ]] \
  || fail "Deployment state has an invalid Git commit"
[[ "$state_image" =~ ^ccr\.ccs\.tencentyun\.com/lqzzql/web@sha256:[0-9a-f]{64}$ ]] \
  || fail "Deployment state has an invalid image digest"
[[ "$state_fingerprint" =~ ^[0-9a-f]{64}$ ]] \
  || fail "Deployment state has an invalid source fingerprint"

expected_release_sha="${EXPECTED_RELEASE_SHA:-$state_commit}"
allow_legacy_release="${QZSITE_ALLOW_LEGACY_RELEASE:-0}"
[[ "$allow_legacy_release" == "0" || "$allow_legacy_release" == "1" ]] \
  || fail "QZSITE_ALLOW_LEGACY_RELEASE must be 0 or 1"
[[ "$expected_release_sha" =~ ^[0-9a-f]{40}$ ]] \
  || fail "EXPECTED_RELEASE_SHA must be a full lowercase Git SHA"
[[ "$expected_release_sha" == "$state_commit" ]] \
  || fail "Expected release SHA does not match deployment state"

current_commit="$(git rev-parse --verify HEAD)"
[[ "$current_commit" == "$state_commit" ]] \
  || fail "Checked-out source does not match deployment state"
git diff --quiet --ignore-submodules -- \
  || fail "Tracked production source has unstaged changes"
git diff --cached --quiet --ignore-submodules -- \
  || fail "Tracked production source has staged changes"

configured_image="$(awk -F= '$1 == "WEB_IMAGE" { print substr($0, index($0, "=") + 1) }' "$APP_DIR/.env" | tail -n 1)"
configured_release_sha="$(awk -F= '$1 == "APP_RELEASE_SHA" { print substr($0, index($0, "=") + 1) }' "$APP_DIR/.env" | tail -n 1)"
[[ "$configured_image" == "$state_image" ]] \
  || fail "Configured WEB_IMAGE does not match deployment state"

image_revision="$(docker image inspect "$state_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
image_release_sha="$(
  docker image inspect "$state_image" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | awk -F= '$1 == "APP_RELEASE_SHA" { print substr($0, index($0, "=") + 1); exit }'
)"
if [[ "$allow_legacy_release" == "1" ]]; then
  [[ -z "$configured_release_sha" ]] \
    || fail "Legacy rollback must not carry a configured APP_RELEASE_SHA"
  [[ -z "$image_release_sha" ]] \
    || fail "An image with APP_RELEASE_SHA cannot use the legacy rollback contract"
  [[ -z "$image_revision" || "$image_revision" == "<no value>" ]] \
    || fail "An image with an OCI revision cannot use the legacy rollback contract"
else
  [[ "$configured_release_sha" == "$state_commit" ]] \
    || fail "Configured APP_RELEASE_SHA does not match deployment state"
  [[ "$image_revision" == "$state_commit" ]] \
    || fail "OCI image revision does not match deployment state"
  [[ "$image_release_sha" == "$state_commit" ]] \
    || fail "Image APP_RELEASE_SHA does not match deployment state"
fi

web_container="$(compose ps --quiet web)"
[[ -n "$web_container" ]] || fail "Web container is not running"
[[ "$(docker inspect --format '{{.State.Running}}' "$web_container")" == "true" ]] \
  || fail "Web container is not running"

running_image_id="$(docker inspect --format '{{.Image}}' "$web_container")"
expected_image_id="$(docker image inspect "$state_image" --format '{{.Id}}')"
[[ "$running_image_id" == "$expected_image_id" ]] \
  || fail "Running Web container does not use the recorded image"
running_release_sha="$(docker inspect "$web_container" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | awk -F= '$1 == "APP_RELEASE_SHA" { print substr($0, index($0, "=") + 1); exit }')"
if [[ "$allow_legacy_release" == "1" ]]; then
  [[ -z "$running_release_sha" ]] \
    || fail "A running container with APP_RELEASE_SHA cannot use the legacy rollback contract"
else
  [[ "$running_release_sha" == "$state_commit" ]] \
    || fail "Running Web container has the wrong APP_RELEASE_SHA"
fi

image_fingerprint="$(docker exec "$web_container" cat /app/.source-fingerprint)"
[[ "$image_fingerprint" == "$state_fingerprint" ]] \
  || fail "Running image fingerprint does not match deployment state"

if [[ "$allow_legacy_release" == "1" ]]; then
  log "Legacy rollback accepts the recorded stable state as its trust anchor after exact Git and image checks"
else
  source_fingerprint="$(
    docker run --rm --pull never --read-only --network none \
      --volume "$APP_DIR:/source:ro" \
      --entrypoint node \
      "$state_image" \
      /prisma/tools/scripts/source-fingerprint.mjs /source /app/.source-manifest.json "$state_commit"
  )"
  [[ "$source_fingerprint" == "$image_fingerprint" ]] \
    || fail "Checked-out source does not match the running image"
fi

health_release_identity="$(
  docker exec "$web_container" node -e '
    fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(10000) })
      .then(async response => {
        if (!response.ok) process.exit(1)
        const payload = await response.json()
        if (payload.status !== "ok") process.exit(1)
        if (payload.releaseSha === undefined) {
          process.stdout.write("legacy")
          return
        }
        if (!/^[0-9a-f]{40}$/.test(payload.releaseSha)) process.exit(1)
        process.stdout.write(payload.releaseSha)
      })
      .catch(() => process.exit(1))
  '
)"
if [[ "$allow_legacy_release" == "1" ]]; then
  [[ "$health_release_identity" == "legacy" ]] \
    || fail "Legacy rollback health unexpectedly exposed a release identity"
  log "Legacy rollback provenance verified without an application releaseSha"
else
  [[ "$health_release_identity" == "$state_commit" ]] \
    || fail "Health endpoint release SHA does not match deployment state"
fi

log "Release provenance verified: ${state_commit:0:12} ${state_image#${registry_repository}@}"
