#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mode="${1:-renew}"
[[ "$mode" == "renew" || "$mode" == "--issue" ]] \
  || fail "Usage: ops/acme-renew.sh [--issue]"

prepare_owned_lock_file "$ACME_LOCK_PATH" "ACME lock"
exec 6>>"$ACME_LOCK_PATH"
flock -w 900 6 || fail "Another ACME operation is still running"
command -v sudo > /dev/null 2>&1 || fail "sudo is required for TLS file operations"
sudo -n true > /dev/null 2>&1 \
  || fail "Non-interactive sudo is required for TLS file operations"

require_exact_directory "$BACKUP_DIR" "$APP_DIR/backups" "Backup"
config="$BACKUP_DIR/.acme-config"
require_regular_or_absent "$config" "ACME configuration"
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

nginx_root="$APP_DIR/nginx"
require_exact_directory "$nginx_root" "$APP_DIR/nginx" "Nginx"
cert_dir="$nginx_root/certs"
ensure_exact_directory "$cert_dir" "$APP_DIR/nginx/certs" "TLS certificate"
cert_path="$cert_dir/server_bundle.crt"
key_path="$cert_dir/server.key"
require_regular_or_absent "$cert_path" "TLS certificate"
require_regular_or_absent "$key_path" "TLS private key"

installed_certificate_is_healthy() {
  [[ -s "$cert_path" && -s "$key_path" ]] || return 1
  sudo -n openssl x509 -in "$cert_path" -noout -checkend 2592000 \
    > /dev/null 2>&1 || return 1
  sudo -n openssl x509 -in "$cert_path" -noout -checkhost liaoqizai.site \
    > /dev/null 2>&1 || return 1
  sudo -n openssl x509 -in "$cert_path" -noout -checkhost www.liaoqizai.site \
    > /dev/null 2>&1 || return 1
  local installed_cert_hash installed_key_hash
  installed_cert_hash="$(
    sudo -n openssl x509 -in "$cert_path" -pubkey -noout \
      | openssl pkey -pubin -outform DER 2>/dev/null \
      | sha256sum \
      | cut -d' ' -f1
  )" || return 1
  installed_key_hash="$(
    sudo -n openssl pkey -in "$key_path" -pubout -outform DER -passin pass: \
      2>/dev/null \
      | sha256sum \
      | cut -d' ' -f1
  )" || return 1
  [[ "$installed_cert_hash" == "$installed_key_hash" ]] || return 1
  compose exec --no-TTY nginx nginx -t > /dev/null 2>&1
}

if [[ "$mode" == "renew" ]] && installed_certificate_is_healthy; then
  log "ACME renewal not due; installed certificate has more than 30 days remaining"
  exit 0
fi

data_path="$APP_DIR/data"
[[ -d "$data_path" && ! -L "$data_path" ]] \
  || fail "Data root must be a real directory"
data_root="$(realpath -- "$data_path")"
[[ "$data_root" == "$APP_DIR/data" ]] \
  || fail "Data root resolved outside the application directory"
acme_root="$data_root/acme"
[[ ! -L "$acme_root" ]] || fail "ACME state path must not be a symbolic link"
sudo -n install -d -m 700 -o "$(id -u)" -g "$(id -g)" "$acme_root"
[[ -d "$acme_root" && ! -L "$acme_root" ]] \
  || fail "ACME state path must be a real directory"
acme_root="$(realpath -- "$acme_root")"
[[ "$acme_root" == "$data_root/acme" ]] \
  || fail "ACME state directory resolved outside data"
backup_dir="$(mktemp -d "$BACKUP_DIR/tls-acme-$(date -u +'%Y%m%dT%H%M%SZ').XXXXXX")"
chmod 700 "$backup_dir"
had_cert=0
had_key=0
if [[ -f "$cert_path" ]]; then
  had_cert=1
  sudo -n install -m 600 -o root -g root \
    "$cert_path" "$backup_dir/server_bundle.crt"
fi
if [[ -f "$key_path" ]]; then
  had_key=1
  sudo -n install -m 600 -o root -g root \
    "$key_path" "$backup_dir/server.key"
fi

nginx_stop_attempted=0
new_certificate_installed=0
finish() {
  local exit_code=$?
  local recovery_failed=0
  trap - EXIT
  set +e
  if ((exit_code != 0 && new_certificate_installed == 1)); then
    log "ACME installation failed; restoring the previous certificate"
    if ((had_cert == 1)); then
      sudo -n install -m 644 -o root -g root \
        "$backup_dir/server_bundle.crt" "$cert_path" \
        || recovery_failed=1
    else
      sudo -n rm -f -- "$cert_path" || recovery_failed=1
    fi
    if ((had_key == 1)); then
      sudo -n install -m 600 -o root -g root \
        "$backup_dir/server.key" "$key_path" \
        || recovery_failed=1
    else
      sudo -n rm -f -- "$key_path" || recovery_failed=1
    fi
    if ((had_cert == 1)); then
      sudo -n cmp --silent -- "$backup_dir/server_bundle.crt" "$cert_path" \
        || recovery_failed=1
    elif sudo -n test -e "$cert_path" || sudo -n test -L "$cert_path"; then
      recovery_failed=1
    fi
    if ((had_key == 1)); then
      sudo -n cmp --silent -- "$backup_dir/server.key" "$key_path" \
        || recovery_failed=1
    elif sudo -n test -e "$key_path" || sudo -n test -L "$key_path"; then
      recovery_failed=1
    fi
  fi
  if ((nginx_stop_attempted == 1 \
    || (exit_code != 0 && new_certificate_installed == 1))); then
    compose start nginx > /dev/null 2>&1 || recovery_failed=1
    compose exec --no-TTY nginx nginx -t > /dev/null 2>&1 \
      || recovery_failed=1
    compose exec --no-TTY nginx nginx -s reload > /dev/null 2>&1 \
      || recovery_failed=1
    curl --fail --silent --show-error --retry 3 \
      --resolve liaoqizai.site:443:127.0.0.1 \
      https://liaoqizai.site/api/health > /dev/null 2>&1 \
      || recovery_failed=1
    disk_certificate_fingerprint="$(
      sudo -n openssl x509 -in "$cert_path" -outform DER 2>/dev/null \
        | sha256sum \
        | cut -d' ' -f1
    )" || recovery_failed=1
    live_certificate_fingerprint="$(
      timeout 10 openssl s_client \
        -connect 127.0.0.1:443 -servername liaoqizai.site < /dev/null 2>/dev/null \
        | openssl x509 -outform DER 2>/dev/null \
        | sha256sum \
        | cut -d' ' -f1
    )" || recovery_failed=1
    [[ -n "${disk_certificate_fingerprint:-}" \
      && "$disk_certificate_fingerprint" == "$live_certificate_fingerprint" ]] \
      || recovery_failed=1
  fi
  if ((recovery_failed == 1)); then
    log "CRITICAL: ACME recovery did not restore a verified HTTPS service; backup retained at $backup_dir" >&2
    exit 70
  fi
  exit "$exit_code"
}
trap finish EXIT

log "Stopping Nginx briefly for the ACME HTTP-01 standalone challenge"
nginx_stop_attempted=1
compose stop --timeout 15 nginx

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

new_certificate_installed=1
docker run --rm --network none --read-only \
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
    chmod 644 /target-certs/.server_bundle.crt.acme
    chmod 600 /target-certs/.server.key.acme
    chown 0:0 /target-certs/.server_bundle.crt.acme /target-certs/.server.key.acme
    mv /target-certs/.server_bundle.crt.acme /target-certs/server_bundle.crt
    mv /target-certs/.server.key.acme /target-certs/server.key
  '

sudo -n openssl x509 -in "$cert_path" -noout -checkhost liaoqizai.site > /dev/null \
  || fail "ACME certificate does not cover liaoqizai.site"
sudo -n openssl x509 -in "$cert_path" -noout -checkhost www.liaoqizai.site > /dev/null \
  || fail "ACME certificate does not cover www.liaoqizai.site"
cert_key_hash="$(
  sudo -n openssl x509 -in "$cert_path" -pubkey -noout \
    | openssl pkey -pubin -outform DER 2>/dev/null \
    | sha256sum \
    | cut -d' ' -f1
)"
private_key_hash="$(
  sudo -n openssl pkey -in "$key_path" -pubout -outform DER -passin pass: 2>/dev/null \
    | sha256sum \
    | cut -d' ' -f1
)"
[[ "$cert_key_hash" == "$private_key_hash" ]] \
  || fail "ACME certificate and private key do not match"

compose start nginx
compose exec --no-TTY nginx nginx -t
bash "$APP_DIR/ops/check-ssl.sh"
nginx_stop_attempted=0

new_certificate_installed=0
log "ACME certificate installed and verified"
