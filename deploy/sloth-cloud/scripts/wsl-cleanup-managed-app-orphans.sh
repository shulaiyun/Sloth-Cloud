#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/deploy/sloth-cloud/docker-compose.yml"
PAYMENTER_ENV_FILE="${ROOT_DIR}/runtime/env/paymenter.env"
KUBECONFIG_FILE_DEFAULT="${ROOT_DIR}/runtime/data/kubeconfig/config"
MODE="dry-run"
KUBECONFIG_FILE="${KUBECONFIG_PATH:-$KUBECONFIG_FILE_DEFAULT}"
KUBECONFIG_CONTAINER_FILE="${MANAGED_APP_KUBECONFIG_CONTAINER_PATH:-/var/runtime/kubeconfig/config}"
LABEL_SELECTOR="${MANAGED_APP_NAMESPACE_SELECTOR:-sloth.cloud/runtime-kind=managed-app,sloth.cloud/build-namespace!=true}"
KUBECTL_MODE=""

function usage() {
  cat <<'USAGE'
Usage:
  bash deploy/sloth-cloud/scripts/wsl-cleanup-managed-app-orphans.sh [--execute] [--kubeconfig <path>]

Options:
  --execute              Actually delete orphan managed-app namespaces.
  --kubeconfig <path>    Override kubeconfig path (default: runtime/data/kubeconfig/config).
  --help                 Show this help message.

Default mode is dry-run: it only prints which namespaces would be deleted.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute)
      MODE="execute"
      shift
      ;;
    --kubeconfig)
      KUBECONFIG_FILE="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$PAYMENTER_ENV_FILE" ]]; then
  echo "Paymenter env file not found: $PAYMENTER_ENV_FILE" >&2
  exit 1
fi

function detect_kubectl_mode() {
  if command -v kubectl >/dev/null 2>&1; then
    KUBECTL_MODE="local"
    return
  fi

  if docker compose -f "$COMPOSE_FILE" exec -T sloth-cloud-api sh -lc 'command -v kubectl >/dev/null 2>&1'; then
    KUBECTL_MODE="container"
    return
  fi

  echo "kubectl is not available on host or inside sloth-cloud-api container." >&2
  exit 1
}

function run_kubectl() {
  if [[ "$KUBECTL_MODE" == "local" ]]; then
    kubectl --kubeconfig "$KUBECONFIG_FILE" "$@"
    return
  fi

  docker compose -f "$COMPOSE_FILE" exec -T sloth-cloud-api \
    kubectl --kubeconfig "$KUBECONFIG_CONTAINER_FILE" "$@"
}

detect_kubectl_mode

if [[ "$KUBECTL_MODE" == "local" ]]; then
  if [[ ! -f "$KUBECONFIG_FILE" ]]; then
    echo "Kubeconfig not found: $KUBECONFIG_FILE" >&2
    exit 1
  fi
else
  if ! docker compose -f "$COMPOSE_FILE" exec -T sloth-cloud-api sh -lc "[ -f '$KUBECONFIG_CONTAINER_FILE' ]"; then
    echo "Kubeconfig not found in container: $KUBECONFIG_CONTAINER_FILE" >&2
    exit 1
  fi
fi

function read_env_value() {
  local key="$1"
  local fallback="${2:-}"
  local value
  value="$(grep -E "^${key}=" "$PAYMENTER_ENV_FILE" | tail -n 1 | cut -d'=' -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  if [[ -z "$value" ]]; then
    echo "$fallback"
  else
    echo "$value"
  fi
}

DB_NAME="$(read_env_value "DB_DATABASE" "slothcloud_paymenter")"
DB_USER="$(read_env_value "DB_USERNAME" "slothcloud")"
DB_PASSWORD="$(read_env_value "DB_PASSWORD" "")"

if [[ -z "$DB_PASSWORD" ]]; then
  echo "DB_PASSWORD is empty in $PAYMENTER_ENV_FILE." >&2
  exit 1
fi

echo "Collecting managed-app namespaces from Kubernetes..."
mapfile -t CLUSTER_NAMESPACES < <(
  run_kubectl get namespaces -l "$LABEL_SELECTOR" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
    | sed '/^\s*$/d' | sort -u
)

echo "Collecting active managed-app namespaces from Paymenter..."
SQL_QUERY="$(cat <<'SQL'
SELECT DISTINCT p.value
FROM properties p
JOIN services s ON s.id = p.model_id
WHERE p.model_type = 'App\\Models\\Service'
  AND p.`key` = 'k8s_namespace'
  AND COALESCE(TRIM(p.value), '') <> ''
  AND s.status NOT IN ('cancelled');
SQL
)"

mapfile -t EXPECTED_NAMESPACES < <(
  docker compose -f "$COMPOSE_FILE" exec -T sloth-cloud-db \
    mariadb -N -u"$DB_USER" "-p$DB_PASSWORD" "$DB_NAME" -e "$SQL_QUERY" \
    | sed '/^\s*$/d' | sort -u
)

declare -A EXPECTED_MAP=()
for namespace in "${EXPECTED_NAMESPACES[@]}"; do
  EXPECTED_MAP["$namespace"]=1
done

ORPHANS=()
for namespace in "${CLUSTER_NAMESPACES[@]}"; do
  if [[ -z "${EXPECTED_MAP[$namespace]+x}" ]]; then
    ORPHANS+=("$namespace")
  fi
done

echo
echo "Managed-app namespaces in cluster: ${#CLUSTER_NAMESPACES[@]}"
echo "Namespaces referenced by non-cancelled services: ${#EXPECTED_NAMESPACES[@]}"
echo "Orphan namespaces detected: ${#ORPHANS[@]}"

if [[ ${#ORPHANS[@]} -eq 0 ]]; then
  echo "No orphan namespaces found."
  exit 0
fi

printf ' - %s\n' "${ORPHANS[@]}"

if [[ "$MODE" != "execute" ]]; then
  echo
  echo "Dry-run complete. Re-run with --execute to delete these namespaces."
  exit 0
fi

echo
echo "Deleting orphan namespaces..."
for namespace in "${ORPHANS[@]}"; do
  echo "Deleting namespace: $namespace"
  run_kubectl delete namespace "$namespace" --ignore-not-found=true --wait=false
done

echo "Cleanup request submitted."
