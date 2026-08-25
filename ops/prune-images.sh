#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

repository="ccr.ccs.tencentyun.com/lqzzql/web"
history_file="$APP_DIR/.deploy-history"
[[ -f "$history_file" ]] || {
  log "Image cleanup skipped: no confirmed deployment history"
  exit 0
}

declare -A protected_image_ids=()
stable_image_ids=()
while IFS= read -r history_line; do
  read -r commit digest fingerprint confirmed_epoch extra <<< "$history_line"
  [[ -z "${extra:-}" \
    && "$commit" =~ ^[0-9a-f]{40}$ \
    && "$digest" =~ ^ccr\.ccs\.tencentyun\.com/lqzzql/web@sha256:[0-9a-f]{64}$ \
    && "$fingerprint" =~ ^[0-9a-f]{64}$ \
    && "$confirmed_epoch" =~ ^[0-9]+$ ]] || continue
  image_id="$(docker image inspect "$digest" --format '{{.Id}}' 2>/dev/null || true)"
  [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || continue
  [[ -z "${protected_image_ids[$image_id]+present}" ]] || continue
  protected_image_ids["$image_id"]=1
  stable_image_ids+=("$image_id")
  ((${#stable_image_ids[@]} >= 3)) && break
done < <(tac "$history_file")

# Do not automate deletion until three confirmed local stable versions exist.
# This avoids guessing which pre-closure images were actually deployable.
if ((${#stable_image_ids[@]} < 3)); then
  log "Image cleanup skipped: fewer than three confirmed local stable images"
  exit 0
fi

current_container="$(compose ps --quiet web 2>/dev/null || true)"
[[ -n "$current_container" ]] || fail "Running Web container is required for image cleanup"
current_image_id="$(docker inspect "$current_container" --format '{{.Image}}')"
[[ "$current_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail "Running Web image ID is invalid"
protected_image_ids["$current_image_id"]=1

declare -A referenced_image_ids=()
while IFS= read -r container_id; do
  [[ -n "$container_id" ]] || continue
  referenced_id="$(docker inspect "$container_id" --format '{{.Image}}')"
  [[ "$referenced_id" =~ ^sha256:[0-9a-f]{64}$ ]] || continue
  referenced_image_ids["$referenced_id"]=1
done < <(docker ps --all --no-trunc --quiet)

cutoff_epoch=$(( $(date +%s) - 7 * 24 * 60 * 60 ))
deleted=0
while IFS= read -r image_id; do
  [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || continue
  [[ -z "${protected_image_ids[$image_id]+present}" ]] || continue
  [[ -z "${referenced_image_ids[$image_id]+present}" ]] || continue
  created="$(docker image inspect "$image_id" --format '{{.Created}}')"
  created_epoch="$(date --date "$created" +%s)"
  [[ "$created_epoch" =~ ^[0-9]+$ ]] || fail "Image creation time is invalid: $image_id"
  ((created_epoch < cutoff_epoch)) || continue
  log "Removing unreferenced Web image older than seven days: $image_id"
  docker image rm "$image_id"
  ((deleted += 1))
done < <(docker image ls "$repository" --all --no-trunc --quiet | sort -u)

log "Image cleanup complete: removed=$deleted protectedStable=${#stable_image_ids[@]}"
