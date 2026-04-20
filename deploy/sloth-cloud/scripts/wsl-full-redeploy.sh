#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

# Prevent inherited WSL shell proxies from overriding deploy/sloth-cloud/.env
# during docker compose variable interpolation.
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy NO_PROXY no_proxy
unset BUILD_HTTP_PROXY BUILD_HTTPS_PROXY build_http_proxy build_https_proxy BUILD_NO_PROXY build_no_proxy
unset SLOTH_BUILD_HTTP_PROXY SLOTH_BUILD_HTTPS_PROXY SLOTH_BUILD_NO_PROXY
unset SLOTH_RUNTIME_HTTP_PROXY SLOTH_RUNTIME_HTTPS_PROXY SLOTH_RUNTIME_NO_PROXY

# Load compose env values for URL bootstrap commands.
if [[ -f "$ROOT_DIR/deploy/sloth-cloud/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/deploy/sloth-cloud/.env"
fi

"$ROOT_DIR"/deploy/sloth-cloud/scripts/wsl-configure-proxy-env.sh >/dev/null

read_env_file_value() {
  local file="$1"
  local key="$2"
  local fallback="${3:-}"

  if [[ ! -f "$file" ]]; then
    echo "$fallback"
    return 0
  fi

  local value
  value="$(grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  if [[ -z "$value" ]]; then
    echo "$fallback"
  else
    echo "$value"
  fi
}

RUNTIME_API_ENV="$ROOT_DIR/runtime/env/api.env"
MANAGED_APP_ENABLED="$(read_env_file_value "$RUNTIME_API_ENV" "MANAGED_APP_ENABLED" "${MANAGED_APP_ENABLED:-false}")"
MANAGED_APP_DRIVER="$(read_env_file_value "$RUNTIME_API_ENV" "MANAGED_APP_DRIVER" "${MANAGED_APP_DRIVER:-contract}")"
MANAGED_APP_SAFE_FALLBACK_IMAGE="docker.m.daocloud.io/library/node:22-alpine"

SL="docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml"
MANAGED_APP_KUBECONFIG_READY=1

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_managed_app_fallback_node_image() {
  local api_env="$ROOT_DIR/runtime/env/api.env"
  if [[ ! -f "$api_env" ]]; then
    return 0
  fi

  local current_fallback
  current_fallback="$(grep -E '^MANAGED_APP_FALLBACK_NODE_IMAGE=' "$api_env" | tail -n1 | cut -d= -f2- | tr -d '\r')"

  if [[ -z "$current_fallback" ]] \
    || [[ "$current_fallback" == "registry.sloth-cloud.local/library/node:22-alpine" ]] \
    || [[ "$current_fallback" == *":30500/library/node:22-alpine" ]] \
    || [[ "$current_fallback" == *":30500/library/node:22" ]]; then
    if grep -qE '^MANAGED_APP_FALLBACK_NODE_IMAGE=' "$api_env"; then
      sed -i "s#^MANAGED_APP_FALLBACK_NODE_IMAGE=.*#MANAGED_APP_FALLBACK_NODE_IMAGE=${MANAGED_APP_SAFE_FALLBACK_IMAGE}#" "$api_env"
    else
      printf '\nMANAGED_APP_FALLBACK_NODE_IMAGE=%s\n' "$MANAGED_APP_SAFE_FALLBACK_IMAGE" >> "$api_env"
    fi
    echo "INFO: MANAGED_APP_FALLBACK_NODE_IMAGE set to ${MANAGED_APP_SAFE_FALLBACK_IMAGE}"
  fi
}

prepare_managed_app_kubeconfig() {
  if ! is_truthy "${MANAGED_APP_ENABLED:-false}"; then
    return 0
  fi

  if [[ "${MANAGED_APP_DRIVER:-contract}" != "kubeconfig" ]]; then
    return 0
  fi

  local target="$ROOT_DIR/runtime/data/kubeconfig/config"
  mkdir -p "$(dirname "$target")"

  if [[ -n "${SLOTH_MANAGED_APP_KUBECONFIG_SOURCE:-}" ]]; then
    "$ROOT_DIR"/deploy/sloth-cloud/scripts/wsl-sync-k3s-kubeconfig.sh \
      "$SLOTH_MANAGED_APP_KUBECONFIG_SOURCE" \
      "${SLOTH_MANAGED_APP_K8S_API_SERVER:-}"
  fi

  if [[ ! -f "$target" ]]; then
    MANAGED_APP_KUBECONFIG_READY=0
    echo "WARN: Managed App kubeconfig is missing at $target"
    echo "      Run: deploy/sloth-cloud/scripts/wsl-sync-k3s-kubeconfig.sh <root@host:/etc/rancher/k3s/k3s.yaml> https://<master-ip>:6443"
    return 0
  fi

  if grep -Eq '^[[:space:]]*server:[[:space:]]+https?://(127\.0\.0\.1|localhost)(:|/|$)' "$target"; then
    MANAGED_APP_KUBECONFIG_READY=0
    echo "WARN: Managed App kubeconfig still points to localhost/127.0.0.1."
    echo "      Rewrite it to a cluster-reachable API endpoint, for example https://192.168.16.220:6443"
  fi
}

autotune_managed_app_cluster_defaults() {
  if ! is_truthy "${MANAGED_APP_ENABLED:-false}"; then
    return 0
  fi

  if [[ "${MANAGED_APP_DRIVER:-contract}" != "kubeconfig" || "$MANAGED_APP_KUBECONFIG_READY" != "1" ]]; then
    return 0
  fi

  local api_env="$ROOT_DIR/runtime/env/api.env"
  if [[ ! -f "$api_env" ]]; then
    return 0
  fi

  local configured_storage_class
  configured_storage_class="$(grep -E '^MANAGED_APP_STORAGE_CLASS=' "$api_env" | tail -n1 | cut -d= -f2- | tr -d '\r')"
  if [[ "$configured_storage_class" == "standard" ]]; then
    if ! $SL exec -T sloth-cloud-api sh -lc 'kubectl --kubeconfig /var/runtime/kubeconfig/config get storageclass standard >/dev/null 2>&1' \
      && $SL exec -T sloth-cloud-api sh -lc 'kubectl --kubeconfig /var/runtime/kubeconfig/config get storageclass local-path >/dev/null 2>&1'; then
      sed -i 's/^MANAGED_APP_STORAGE_CLASS=.*/MANAGED_APP_STORAGE_CLASS=local-path/' "$api_env"
      echo "INFO: MANAGED_APP_STORAGE_CLASS switched from standard to local-path (detected K3s default)."
      $SL up -d --no-deps --force-recreate sloth-cloud-api >/dev/null
    fi
  fi

  local configured_issuer
  configured_issuer="$(grep -E '^MANAGED_APP_CERT_ISSUER=' "$api_env" | tail -n1 | cut -d= -f2- | tr -d '\r')"
  if [[ -n "$configured_issuer" ]]; then
    if ! $SL exec -T sloth-cloud-api sh -lc "kubectl --kubeconfig /var/runtime/kubeconfig/config get clusterissuer ${configured_issuer} >/dev/null 2>&1"; then
      echo "WARN: ClusterIssuer '${configured_issuer}' not found. HTTPS certificates will stay pending until this issuer exists."
      echo "      You can set MANAGED_APP_CERT_ISSUER= in runtime/env/api.env to skip cert-manager annotation."
    fi
  fi

  local configured_ingress_class
  configured_ingress_class="$(grep -E '^MANAGED_APP_INGRESS_CLASS=' "$api_env" | tail -n1 | cut -d= -f2- | tr -d '\r')"
  if [[ -n "$configured_ingress_class" ]]; then
    if ! $SL exec -T sloth-cloud-api sh -lc "kubectl --kubeconfig /var/runtime/kubeconfig/config get ingressclass ${configured_ingress_class} >/dev/null 2>&1"; then
      if $SL exec -T sloth-cloud-api sh -lc 'kubectl --kubeconfig /var/runtime/kubeconfig/config get ingressclass | grep -q " traefik"'; then
        sed -i 's/^MANAGED_APP_INGRESS_CLASS=.*/MANAGED_APP_INGRESS_CLASS=traefik/' "$api_env"
        echo "INFO: MANAGED_APP_INGRESS_CLASS switched to traefik (detected cluster default)."
      else
        sed -i 's/^MANAGED_APP_INGRESS_CLASS=.*/MANAGED_APP_INGRESS_CLASS=/' "$api_env"
        echo "INFO: MANAGED_APP_INGRESS_CLASS cleared because configured class was missing."
      fi
      $SL up -d --no-deps --force-recreate sloth-cloud-api >/dev/null
    fi
  fi
}

ensure_managed_app_fallback_node_image

echo "[0/11] Start edge relay services"
$SL up -d sloth-cloud-proxy-relay sloth-cloud-cloudflare-origin

echo "[1/11] Build core images"
$SL build --no-cache sloth-cloud-paymenter sloth-cloud-api sloth-cloud-web

echo "[2/11] Recreate containers"
$SL up -d --force-recreate sloth-cloud-paymenter sloth-cloud-api sloth-cloud-web

echo "[3/11] Repair Paymenter storage permissions"
$SL exec -T --user root sloth-cloud-paymenter sh -lc '
  mkdir -p /var/www/html/storage/logs /var/www/html/storage/framework/cache/data /var/www/html/storage/framework/sessions /var/www/html/storage/framework/views /var/www/html/bootstrap/cache &&
  touch /var/www/html/storage/logs/laravel-$(date +%F).log &&
  chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache &&
  chmod -R ug+rwX /var/www/html/storage /var/www/html/bootstrap/cache
'

echo "[4/11] Clear caches / migrate"
$SL exec -T sloth-cloud-paymenter php artisan migrate --force
$SL exec -T sloth-cloud-paymenter php artisan optimize:clear
$SL exec -T sloth-cloud-paymenter php artisan app:affiliates:bootstrap --reward="${SLOTH_AFFILIATE_REWARD:-10}" --cookie-days="${SLOTH_AFFILIATE_COOKIE_DAYS:-30}" --code-type="${SLOTH_AFFILIATE_CODE_TYPE:-random}"

echo "[5/11] Bootstrap notification templates"
$SL exec -T sloth-cloud-paymenter php artisan app:notifications:bootstrap-defaults

echo "[6/11] Configure Epay callback/return URLs (safe defaults)"
PAYMENTER_PUBLIC_URL="${SLOTH_PAYMENTER_PUBLIC_URL:-http://localhost:${SLOTH_PAYMENTER_PORT:-18080}}"
WEB_PUBLIC_URL="${SLOTH_WEB_PUBLIC_URL:-http://localhost:${SLOTH_WEB_PORT:-13000}}"
if [[ "$PAYMENTER_PUBLIC_URL" == *".example"* || "$WEB_PUBLIC_URL" == *".example"* ]]; then
  PAYMENTER_PUBLIC_URL="http://localhost:${SLOTH_PAYMENTER_PORT:-18080}"
  WEB_PUBLIC_URL="http://localhost:${SLOTH_WEB_PORT:-13000}"
fi

if [[ "$PAYMENTER_PUBLIC_URL" == http://localhost* || "$PAYMENTER_PUBLIC_URL" == https://localhost* || "$WEB_PUBLIC_URL" == http://localhost* || "$WEB_PUBLIC_URL" == https://localhost* ]]; then
  $SL exec -T sloth-cloud-paymenter php artisan app:gateway:configure-epay \
    --allow-private \
    --callback-base-url="$PAYMENTER_PUBLIC_URL" \
    --frontend-return-url="${WEB_PUBLIC_URL%/}/invoices/{number}" || true
else
  $SL exec -T sloth-cloud-paymenter php artisan app:gateway:configure-epay \
    --callback-base-url="$PAYMENTER_PUBLIC_URL" \
    --frontend-return-url="${WEB_PUBLIC_URL%/}/invoices/{number}" || true
fi

echo "[7/11] Bootstrap managed-app catalog"
$SL exec -T sloth-cloud-paymenter php artisan app:catalog:bootstrap-managed-app

echo "[8/11] Bootstrap regional VPS catalog"
PAYMENTER_TEMPLATE="${CONVOY_DEFAULT_TEMPLATE_UUID:-}"
if [[ -z "$PAYMENTER_TEMPLATE" && -f "$ROOT_DIR/runtime/env/paymenter.env" ]]; then
  PAYMENTER_TEMPLATE="$(grep -E '^CONVOY_DEFAULT_TEMPLATE_UUID=' "$ROOT_DIR/runtime/env/paymenter.env" | tail -n1 | cut -d= -f2- | tr -d '\r')"
fi
PAYMENTER_TEMPLATE="${PAYMENTER_TEMPLATE%\"}"
PAYMENTER_TEMPLATE="${PAYMENTER_TEMPLATE#\"}"
VPS_TEMPLATE="${SLOTH_VPS_TEMPLATE:-${PAYMENTER_TEMPLATE:-Ubuntu 22.04}}"
US_NODE="${SLOTH_US_NODE_ID:-1}"
HK_NODE="${SLOTH_HK_NODE_ID:-2}"
if ! $SL exec -T sloth-cloud-paymenter php artisan app:catalog:bootstrap-vps-regional --template="$VPS_TEMPLATE" --us-node="$US_NODE" --hk-node="$HK_NODE"; then
  echo "WARN: regional VPS catalog bootstrap skipped."
  echo "      template=$VPS_TEMPLATE us-node=$US_NODE hk-node=$HK_NODE"
  echo "      Set SLOTH_VPS_TEMPLATE/SLOTH_US_NODE_ID/SLOTH_HK_NODE_ID and rerun if needed."
fi

echo "[8.5/11] Validate managed-app kubeconfig"
prepare_managed_app_kubeconfig
autotune_managed_app_cluster_defaults

echo "[9/11] Bootstrap + sync provisioning mappings"
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:bootstrap --provider=convoy --sync-file
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=convoy --enqueue-services
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=managed-app --enqueue-services

echo "[10/11] Run provisioning queue"
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:run --provider=convoy --limit=100
if [[ "$MANAGED_APP_KUBECONFIG_READY" == "1" ]]; then
  $SL exec -T sloth-cloud-paymenter php artisan app:provisioning:run --provider=managed-app --limit=100
else
  echo "WARN: skipping managed-app provisioning run because kubeconfig is unavailable."
fi
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:reconcile-status --limit=100

echo "[11/11] Smoke check"
"$ROOT_DIR"/deploy/sloth-cloud/scripts/wsl-smoke-check.sh

echo
echo "Redeploy done."
echo "Web       : http://localhost:13000"
echo "API       : http://localhost:14000/api/v1/health"
echo "Paymenter : http://localhost:18080"
echo "Convoy    : http://localhost:18181"
