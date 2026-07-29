#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ -n "${TLS_CERT_B64:-}" ]] || fail "TLS_CERT_B64 is required"
[[ -n "${TLS_KEY_B64:-}" ]] || fail "TLS_KEY_B64 is required"

cert_path="$APP_DIR/nginx/certs/server_bundle.crt"
key_path="$APP_DIR/nginx/certs/server.key"
mkdir -p "$(dirname "$cert_path")" "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

cert_tmp="$(mktemp)"
key_tmp="$(mktemp)"
backup_dir="$BACKUP_DIR/tls-$(date -u +'%Y%m%dT%H%M%SZ')"
installed=0
had_cert=0
had_key=0

cleanup() {
  rm -f -- "$cert_tmp" "$key_tmp"
}

finish() {
  local exit_code=$?
  trap - EXIT
  set +e
  if ((exit_code != 0 && installed == 1)); then
    log "TLS update failed; restoring the previous certificate"
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
  cleanup
  exit "$exit_code"
}
trap finish EXIT

printf '%s' "$TLS_CERT_B64" | base64 --decode > "$cert_tmp"
printf '%s' "$TLS_KEY_B64" | base64 --decode > "$key_tmp"
chmod 600 "$cert_tmp" "$key_tmp"

openssl x509 -in "$cert_tmp" -noout -checkhost liaoqizai.site > /dev/null \
  || fail "Certificate does not cover liaoqizai.site"
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

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
if [[ -f "$cert_path" ]]; then
  had_cert=1
  install -m 600 "$cert_path" "$backup_dir/server_bundle.crt"
fi
if [[ -f "$key_path" ]]; then
  had_key=1
  install -m 600 "$key_path" "$backup_dir/server.key"
fi

install -m 600 "$cert_tmp" "$cert_path"
install -m 600 "$key_tmp" "$key_path"
installed=1

compose exec --no-TTY nginx nginx -t
compose exec --no-TTY nginx nginx -s reload
bash "$APP_DIR/ops/check-ssl.sh"

installed=0
log "TLS certificate installed successfully"
