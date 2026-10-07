#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export TOKTAGGER_HOST=localhost KEYCLOAK_HOST=keycloak.localhost
export AUTH_SECRET_KEY=smoke-secret KEYCLOAK_CLIENT_SECRET=smoke-client-secret
export KEYCLOAK_ADMIN_PASSWORD=smokeadmin POSTGRES_PASSWORD=smokepostgres MONGO_PASSWORD=smokemongo
project=toktagger-smoke
compose=(docker compose -p "$project")
resolve=(--resolve localhost:443:127.0.0.1 --resolve keycloak.localhost:443:127.0.0.1)

cleanup() { "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1; }
trap cleanup EXIT

fail() { echo "FAIL: $1" >&2; "${compose[@]}" logs --tail 40 >&2; exit 1; }

"${compose[@]}" up -d --build --wait --wait-timeout 300 || fail "stack did not become healthy"

curl -fsSk "${resolve[@]}" https://localhost/health >/dev/null || fail "/health through the proxy"
curl -fsSk "${resolve[@]}" https://localhost/auth/config | grep -q '"provider":"oidc"' || fail "/auth/config"
curl -fsSk "${resolve[@]}" https://keycloak.localhost/realms/toktagger/.well-known/openid-configuration \
  | grep -q '"issuer":"https://keycloak.localhost/realms/toktagger"' || fail "Keycloak issuer"

location=$(curl -sk "${resolve[@]}" -o /dev/null -w '%{redirect_url}' https://localhost/auth/login)
case "$location" in
  https://keycloak.localhost/realms/toktagger/protocol/openid-connect/auth\?*) ;;
  *) fail "/auth/login redirects to: $location" ;;
esac

published=$("${compose[@]}" ps --format '{{.Service}} {{.Publishers}}' | grep -v '^caddy ' | grep -c '0.0.0.0' || true)
[ "$published" -eq 0 ] || fail "a service other than caddy publishes a port"

echo "Smoke test passed"
