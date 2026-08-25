#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ -e "/proc/$$/fd/3" && -e "/proc/$$/fd/4" ]] \
  || fail "Base64 certificate and key must be provided on file descriptors 3 and 4"
command -v sudo > /dev/null 2>&1 || fail "sudo is required for TLS file operations"
sudo -n true > /dev/null 2>&1 \
  || fail "Non-interactive sudo is required for TLS file operations"

ensure_exact_directory "$BACKUP_DIR" "$APP_DIR/backups" "Backup"
nginx_root="$APP_DIR/nginx"
require_exact_directory "$nginx_root" "$APP_DIR/nginx" "Nginx"
cert_dir="$nginx_root/certs"
ensure_exact_directory "$cert_dir" "$APP_DIR/nginx/certs" "TLS certificate"
cert_path="$cert_dir/server_bundle.crt"
key_path="$cert_dir/server.key"
require_regular_or_absent "$cert_path" "TLS certificate"
require_regular_or_absent "$key_path" "TLS private key"
chmod 700 "$BACKUP_DIR"

cert_tmp="$(mktemp)"
key_tmp="$(mktemp)"
backup_dir="$(mktemp -d "$BACKUP_DIR/tls-$(date -u +'%Y%m%dT%H%M%SZ').XXXXXX")"
installed=0
had_cert=0
had_key=0

cleanup() {
  rm -f -- "$cert_tmp" "$key_tmp"
}

finish() {
  local exit_code=$?
  local recovery_failed=0
  trap - EXIT
  set +e
  if ((exit_code != 0 && installed == 1)); then
    log "TLS update failed; restoring the previous certificate"
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
    log "CRITICAL: TLS recovery did not restore a verified HTTPS service; backup retained at $backup_dir" >&2
    cleanup
    exit 70
  fi
  cleanup
  exit "$exit_code"
}
trap finish EXIT

base64 --decode <&3 > "$cert_tmp"
base64 --decode <&4 > "$key_tmp"
exec 3<&- 4<&-
chmod 600 "$cert_tmp" "$key_tmp"

openssl x509 -in "$cert_tmp" -noout -checkhost liaoqizai.site > /dev/null \
  || fail "Certificate does not cover liaoqizai.site"
openssl x509 -in "$cert_tmp" -noout -checkhost www.liaoqizai.site > /dev/null \
  || fail "Certificate does not cover www.liaoqizai.site"
openssl x509 -in "$cert_tmp" -noout -checkend 2592000 > /dev/null \
  || fail "Certificate expires within 30 days"
openssl pkey -in "$key_tmp" -noout -passin pass: > /dev/null

cert_key_hash="$(
  openssl x509 -in "$cert_tmp" -pubkey -noout \
    | openssl pkey -pubin -outform DER 2>/dev/null \
    | sha256sum \
    | cut -d' ' -f1
)"
private_key_hash="$(
  openssl pkey -in "$key_tmp" -pubout -outform DER -passin pass: 2>/dev/null \
    | sha256sum \
    | cut -d' ' -f1
)"
[[ "$cert_key_hash" == "$private_key_hash" ]] \
  || fail "Certificate and private key do not match"

chmod 700 "$backup_dir"
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

installed=1
sudo -n install -m 644 -o root -g root "$cert_tmp" "$cert_path"
sudo -n install -m 600 -o root -g root "$key_tmp" "$key_path"

compose start nginx
compose exec --no-TTY nginx nginx -t
compose exec --no-TTY nginx nginx -s reload
bash "$APP_DIR/ops/check-ssl.sh"

installed=0
log "TLS certificate installed successfully"
