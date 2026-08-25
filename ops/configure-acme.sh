#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ -n "${ACME_EMAIL:-}" ]] || fail "ACME_EMAIL is required"
[[ "$ACME_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] \
  || fail "ACME_EMAIL is invalid"
acme_image="${ACME_IMAGE:-certbot/certbot@sha256:d07bd043d61d6bee1114235ac12c2e9a5c54b6931b3ccf5e1174d6c8c4afaa95}"
[[ "$acme_image" =~ ^certbot/certbot@sha256:[0-9a-f]{64}$ ]] \
  || fail "ACME_IMAGE must be an immutable certbot/certbot digest"

docker image inspect "$acme_image" > /dev/null 2>&1 || docker pull "$acme_image"
resolved_digest="$(docker image inspect "$acme_image" --format '{{index .RepoDigests 0}}')"
[[ "$resolved_digest" == "$acme_image" ]] \
  || fail "Pulled ACME image digest does not match ACME_IMAGE"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
config_tmp="$(mktemp "$BACKUP_DIR/.acme-config.XXXXXX")"
cleanup() {
  rm -f -- "$config_tmp"
}
trap cleanup EXIT
printf '%s\n%s\n' "$ACME_EMAIL" "$acme_image" > "$config_tmp"
chmod 600 "$config_tmp"
mv -- "$config_tmp" "$BACKUP_DIR/.acme-config"

unset ACME_EMAIL ACME_IMAGE acme_image
bash "$APP_DIR/ops/acme-renew.sh" --issue
log "ACME account and automatic renewal configured"
