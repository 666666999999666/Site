#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

site_url="${SITE_URL:-https://liaoqizai.site}"
curl_resolve="${CURL_RESOLVE:-liaoqizai.site:443:127.0.0.1}"
curl_args=(
  --silent
  --show-error
  --connect-timeout 5
  --max-time 20
  --retry 3
  --retry-delay 2
)
if [[ -n "$curl_resolve" ]]; then
  curl_args+=(--resolve "$curl_resolve")
fi

health="$(curl --fail "${curl_args[@]}" "$site_url/api/health")"
[[ "$health" == *'"status":"ok"'* ]] \
  || fail "Public health endpoint returned an unexpected response"

zh_page="$(curl --fail "${curl_args[@]}" "$site_url/zh")"
[[ "$zh_page" == *'切换到英文'* && "$zh_page" == *'管理入口'* ]] \
  || fail "Chinese page did not contain the expected localized controls"

en_page="$(curl --fail "${curl_args[@]}" "$site_url/en")"
[[ "$en_page" == *'Switch to Chinese'* && "$en_page" == *'Admin entry'* ]] \
  || fail "English page did not contain the expected localized controls"

todo_status="$(
  curl "${curl_args[@]}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    --request POST \
    --header 'Content-Type: application/json' \
    --data '{"title":"unauthenticated-smoke-test"}' \
    "$site_url/api/todos"
)"
[[ "$todo_status" == "401" ]] \
  || fail "Unauthenticated Todo write returned HTTP $todo_status instead of 401"

curl --fail "${curl_args[@]}" "$site_url/robots.txt" > /dev/null
curl --fail "${curl_args[@]}" "$site_url/sitemap.xml" > /dev/null

log "Public smoke tests passed"
