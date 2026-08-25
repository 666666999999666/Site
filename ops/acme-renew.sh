#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mode="${1:-renew}"
[[ "$mode" == "renew" || "$mode" == "--issue" ]] \
  || fail "Usage: ops/acme-renew.sh [--issue]"

exec 6>"/tmp/qzsite-acme.lock"
flock -w 900 6 || fail "Another ACME operation is still running"

config="$BACKUP_DIR/.acme-config"
require_file "$config"
[[ "$(stat --format='%a' -- "$config")" == "600" ]] \
  || fail "ACME configuration must have mode 600"
mapfile -t acme_config < "$config"
[[ "${#acme_config[@]}" -eq 2 ]] || fail "ACME configuration is malformed"
acme_email="${acme_config[0]}"
acme_image="${acme_config[1]}"
[[ "$acme_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] \
  || fail "Configured ACME email is invalid"
[[ "$acme_image" =~ ^certbot/certbot@sha256:[0-9a-f]{64}$ ]] \
  || fail "Configured ACME image is not immutable"
docker image inspect "$acme_image" > /dev/null 2>&1 \
  || fail "Configured ACME image is not available locally"

cert_path="$APP_DIR/nginx/certs/server_bundle.crt"
key_path="$APP_DIR/nginx/certs/server.key"
if [[ "$mode" == "renew" && -f "$cert_path" ]] \
  && openssl x509 -in "$cert_path" -noout -checkend 2592000 > /dev/null 2>&1; then
  log "ACME renewal not due; installed certificate has more than 30 days remaining"
  exit 0
fi

acme_root="$APP_DIR/data/acme"
mkdir -p "$acme_root" "$APP_DIR/nginx/certs" "$BACKUP_DIR"
[[ -d "$acme_root" && ! -L "$acme_root" ]] \
  || fail "ACME state path must be a real directory"
acme_root="$(realpath -- "$acme_root")"
data_root="$(realpath -- "$APP_DIR/data")"
[[ "$acme_root" == "$data_root/acme" ]] \
  || fail "ACME state directory resolved outside data"

backup_dir="$BACKUP_DIR/tls-acme-$(date -u +'%Y%m%dT%H%M%SZ')"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
had_cert=0
had_key=0
if [[ -f "$cert_path" ]]; then
  had_cert=1
  install -m 600 "$cert_path" "$backup_dir/server_bundle.crt"
fi
if [[ -f "$key_path" ]]; then
  had_key=1
  install -m 600 "$key_path" "$backup_dir/server.key"
fi

nginx_stopped=0
new_certificate_installed=0
finish() {
  local exit_code=$?
  trap - EXIT
  set +e
  if ((exit_code != 0 && new_certificate_installed == 1)); then
    log "ACME installation failed; restoring the previous certificate"
    if ((had_cert == 1)); then
      install -m 600 "$backup_dir/server_bundle.crt" "$cert_path"
    else
      rm -f -- "$cert_path"
    fi
    if ((had_key == 1)); then
      install -m 600 "$backup_dir/server.key" "$key_path"
    else
      rm -f -- "$key_path"
    fi
    compose exec --no-TTY nginx nginx -t > /dev/null 2>&1 \
      && compose exec --no-TTY nginx nginx -s reload > /dev/null 2>&1 \
      || true
  fi
  if ((nginx_stopped == 1)); then
    compose start nginx > /dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap finish EXIT

log "Stopping Nginx briefly for the ACME HTTP-01 standalone challenge"
compose stop --timeout 15 nginx
nginx_stopped=1

certbot_args=(
  certonly
  --standalone
  --preferred-challenges http
  --non-interactive
  --agree-tos
  --email "$acme_email"
  --cert-name liaoqizai.site
  --domain liaoqizai.site
  --domain www.liaoqizai.site
  --keep-until-expiring
)
docker run --rm --network host \
  --volume "$acme_root:/etc/letsencrypt" \
  "$acme_image" "${certbot_args[@]}"

host_uid="$(id -u)"
host_gid="$(id -g)"
new_certificate_installed=1
docker run --rm --network none --read-only \
  --env TARGET_UID="$host_uid" \
  --env TARGET_GID="$host_gid" \
  --volume "$acme_root:/etc/letsencrypt:ro" \
  --volume "$APP_DIR/nginx/certs:/target-certs:rw" \
  --entrypoint sh \
  "$acme_image" \
  -ceu '
    source_dir=/etc/letsencrypt/live/liaoqizai.site
    test -s "$source_dir/fullchain.pem"
    test -s "$source_dir/privkey.pem"
    cp "$source_dir/fullchain.pem" /target-certs/.server_bundle.crt.acme
    cp "$source_dir/privkey.pem" /target-certs/.server.key.acme
    chmod 600 /target-certs/.server_bundle.crt.acme /target-certs/.server.key.acme
    chown "$TARGET_UID:$TARGET_GID" \
      /target-certs/.server_bundle.crt.acme /target-certs/.server.key.acme
    mv /target-certs/.server_bundle.crt.acme /target-certs/server_bundle.crt
    mv /target-certs/.server.key.acme /target-certs/server.key
  '

openssl x509 -in "$cert_path" -noout -checkhost liaoqizai.site > /dev/null \
  || fail "ACME certificate does not cover liaoqizai.site"
openssl x509 -in "$cert_path" -noout -checkhost www.liaoqizai.site > /dev/null \
  || fail "ACME certificate does not cover www.liaoqizai.site"
cert_key_hash="$(
  openssl x509 -in "$cert_path" -pubkey -noout \
    | openssl pkey -pubin -outform DER 2>/dev/null \
    | sha256sum \
    | cut -d' ' -f1
)"
private_key_hash="$(
  openssl pkey -in "$key_path" -pubout -outform DER -passin pass: 2>/dev/null \
    | sha256sum \
    | cut -d' ' -f1
)"
[[ "$cert_key_hash" == "$private_key_hash" ]] \
  || fail "ACME certificate and private key do not match"

compose start nginx
nginx_stopped=0
compose exec --no-TTY nginx nginx -t
bash "$APP_DIR/ops/check-ssl.sh"

new_certificate_installed=0
log "ACME certificate installed and verified"
