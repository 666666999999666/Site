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
smoke_ca_file="${SMOKE_CA_FILE:-}"
if [[ -n "$smoke_ca_file" ]]; then
  [[ -f "$smoke_ca_file" ]] || fail "Smoke CA file does not exist"
  curl_args+=(--cacert "$smoke_ca_file")
fi
if [[ -n "$curl_resolve" ]]; then
  curl_args+=(--resolve "$curl_resolve")
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

health="$(curl --fail "${curl_args[@]}" "$site_url/api/health")"
[[ "$health" == *'"status":"ok"'* ]] \
  || fail "Public health endpoint returned an unexpected response"

root_status="$(
  curl "${curl_args[@]}" \
    --dump-header "$tmp_dir/root.headers" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$site_url/"
)"
[[ "$root_status" == "308" ]] \
  || fail "Site root returned HTTP $root_status instead of 308"
grep -Eiq '^location:[[:space:]]*(https?://[^/]+)?/zh([?#]|[[:space:]]*$)' "$tmp_dir/root.headers" \
  || fail "Site root did not redirect to /zh"

zh_page="$(curl --fail "${curl_args[@]}" "$site_url/zh")"
[[ -n "$zh_page" ]] \
  || fail "Chinese home page returned an empty response"

expect_retired_english() {
  local route="$1"
  local label="$2"
  local status
  local headers="$tmp_dir/$label.headers"

  status="$(
    curl "${curl_args[@]}" \
      --dump-header "$headers" \
      --output /dev/null \
      --write-out '%{http_code}' \
      "$site_url$route"
  )"
  [[ "$status" == "410" ]] \
    || fail "Retired English route $route returned HTTP $status instead of 410"
  if grep -Eiq '^location:' "$headers"; then
    fail "Retired English route $route unexpectedly returned a Location header"
  fi
  grep -Eiq '^content-type:[[:space:]]*text/plain;[[:space:]]*charset=utf-8' "$headers" \
    || fail "Retired English route $route did not return the plain-text UTF-8 contract"
  grep -Eiq '^x-robots-tag:[[:space:]]*noindex' "$headers" \
    || fail "Retired English route $route did not opt out of indexing"
  grep -Eiq '^cache-control:[[:space:]]*no-store' "$headers" \
    || fail "Retired English route $route did not disable caching"
}

expect_retired_english "/en" "retired-en-root"
expect_retired_english "/en/blog?source=smoke" "retired-en-blog"

energy_status="$(
  curl "${curl_args[@]}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$site_url/energy"
)"
[[ "$energy_status" != "410" ]] \
  || fail "/energy was incorrectly classified as a retired English route"

curl --fail "${curl_args[@]}" "$site_url/zh/blog/series" > /dev/null
curl --fail "${curl_args[@]}" "$site_url/zh/blog/tags" > /dev/null
curl --fail "${curl_args[@]}" "$site_url/zh/blog/archive" > /dev/null

feed="$(curl --fail "${curl_args[@]}" "$site_url/feed.xml")"
[[ "$feed" == *'<rss'* && "$feed" != *"$site_url/en"* ]] \
  || fail "RSS feed is invalid or contains a retired English URL"

sitemap="$(curl --fail "${curl_args[@]}" "$site_url/sitemap.xml")"
[[ "$sitemap" == *'/zh/blog/series'* \
  && "$sitemap" == *'/zh/blog/tags'* \
  && "$sitemap" == *'/zh/blog/archive'* \
  && "$sitemap" != *"$site_url/en"* ]] \
  || fail "Sitemap is missing Chinese blog routes or contains a retired English URL"

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

resource_metadata="$(curl --fail "${curl_args[@]}" "$site_url/.well-known/oauth-protected-resource/api/mcp")"
[[ "$resource_metadata" == *'"resource":"https://liaoqizai.site/api/mcp"'* \
  && "$resource_metadata" == *'"authorization_servers":["https://liaoqizai.site/api/oauth"]'* \
  && "$resource_metadata" == *'"draft:import"'* \
  && "$resource_metadata" != *'"draft:create"'* ]] \
  || fail "OAuth protected resource metadata is invalid"

resource_alias="$(curl --fail "${curl_args[@]}" "$site_url/.well-known/oauth-protected-resource")"
[[ "$resource_alias" == *'"resource":"https://liaoqizai.site/api/mcp"'* ]] \
  || fail "OAuth protected resource compatibility alias is invalid"

authorization_metadata="$(curl --fail "${curl_args[@]}" "$site_url/.well-known/oauth-authorization-server/api/oauth")"
[[ "$authorization_metadata" == *'"issuer":"https://liaoqizai.site/api/oauth"'* \
  && "$authorization_metadata" == *'"registration_endpoint":"https://liaoqizai.site/api/oauth/oauth2/register"'* \
  && "$authorization_metadata" == *'"token_endpoint":"https://liaoqizai.site/api/oauth/oauth2/token"'* ]] \
  || fail "OAuth authorization server metadata is invalid"

mcp_status="$(
  curl "${curl_args[@]}" \
    --dump-header "$tmp_dir/mcp.headers" \
    --output "$tmp_dir/mcp.body" \
    --write-out '%{http_code}' \
    --request POST \
    --header 'Accept: application/json, text/event-stream' \
    --header 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
    "$site_url/api/mcp"
)"
[[ "$mcp_status" == "401" ]] \
  || fail "Unauthenticated MCP request returned HTTP $mcp_status instead of 401"
grep -Eiq 'www-authenticate:.*Bearer.*resource_metadata="https://liaoqizai.site/.well-known/oauth-protected-resource/api/mcp".*error="invalid_token"' "$tmp_dir/mcp.headers" \
  || fail "MCP 401 response did not include the OAuth resource challenge"
grep -Eiq 'www-authenticate:.*scope="[^"]*draft:import[^"]*"' "$tmp_dir/mcp.headers" \
  || fail "MCP 401 response did not advertise the remote Markdown import scope"

origin_status="$(
  curl "${curl_args[@]}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    --request POST \
    --header 'Origin: https://example.invalid' \
    --header 'Content-Type: application/json' \
    --data '{}' \
    "$site_url/api/mcp"
)"
[[ "$origin_status" == "403" ]] \
  || fail "MCP request with an invalid Origin returned HTTP $origin_status instead of 403"

legacy_gateway_status="$(
  curl "${curl_args[@]}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    --request POST \
    --header 'Content-Type: application/json' \
    --data '{}' \
    "$site_url/api/mcp/gateway/tools/search_drafts"
)"
[[ "$legacy_gateway_status" == "410" ]] \
  || fail "Legacy remote MCP gateway returned HTTP $legacy_gateway_status instead of 410"

legacy_import_status="$(
  curl "${curl_args[@]}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    --request POST \
    --header 'Content-Type: application/json' \
    --data '{}' \
    "$site_url/api/mcp/gateway/imports"
)"
[[ "$legacy_import_status" == "410" ]] \
  || fail "Legacy fixed-credential import returned HTTP $legacy_import_status instead of 410"

upload_without_ticket_status="$(
  curl "${curl_args[@]}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    --request PUT \
    --header 'Content-Type: application/octet-stream' \
    --data-binary 'x' \
    "$site_url/api/mcp/imports/00000000-0000-4000-8000-000000000000/images/0"
)"
[[ "$upload_without_ticket_status" == "401" ]] \
  || fail "Remote import upload without a ticket returned HTTP $upload_without_ticket_status instead of 401"

question_smoke_result=""
if ! question_smoke_result="$(
  compose exec --no-TTY web node -e '
    fetch("http://127.0.0.1:3000/api/internal/question-smoke", {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
    }).then(async response => {
      await response.body?.cancel()
      if (!response.ok) {
        console.error(`Internal Question smoke returned HTTP ${response.status}`)
        process.exitCode = 1
        return
      }
      process.stdout.write("ok")
    }).catch(() => {
      console.error("Internal Question smoke request failed")
      process.exitCode = 1
    })
  '
)"; then
  fail "Internal Question create/reveal/rating smoke test failed"
fi
[[ "$question_smoke_result" == "ok" ]] \
  || fail "Internal Question smoke test returned an unexpected success marker"

log "Public and loopback-only Question smoke tests passed"
