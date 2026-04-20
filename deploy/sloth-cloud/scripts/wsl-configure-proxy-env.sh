#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/sloth-cloud/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "deploy/sloth-cloud/.env not found."
  exit 1
fi

default_build_proxy="http://127.0.0.1:12334"
default_runtime_proxy="http://host.docker.internal:12335"
# Include both historical WSL registry host and current master-hosted registry host.
default_registry_host="192.168.16.220,192.168.16.101"
default_master_host="192.168.16.220"

read_env_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  echo "$value"
}

append_csv_unique() {
  local current="$1"
  local candidate="$2"
  if [[ -z "$candidate" ]]; then
    echo "$current"
    return 0
  fi

  if [[ -z "$current" ]]; then
    echo "$candidate"
    return 0
  fi

  case ",$current," in
    *",$candidate,"*) echo "$current" ;;
    *) echo "$current,$candidate" ;;
  esac
}

merge_csv_list() {
  local merged=""
  local source
  for source in "$@"; do
    IFS=',' read -ra entries <<< "$source"
    for entry in "${entries[@]}"; do
      entry="$(echo "$entry" | xargs)"
      [[ -z "$entry" ]] && continue
      merged="$(append_csv_unique "$merged" "$entry")"
    done
  done
  echo "$merged"
}

upsert_env_line() {
  local key="$1"
  local value="$2"
  local escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[\\/&]/\\&/g')"

  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i -E "s#^${key}=.*#${key}=${escaped}#g" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

existing_build_proxy="$(read_env_value "SLOTH_BUILD_HTTP_PROXY")"
existing_runtime_proxy="$(read_env_value "SLOTH_RUNTIME_HTTP_PROXY")"
legacy_build_proxy="$(read_env_value "BUILD_HTTP_PROXY")"
legacy_runtime_proxy="$(read_env_value "HTTP_PROXY")"
build_proxy="${existing_build_proxy:-${legacy_build_proxy:-$default_build_proxy}}"
runtime_proxy="${existing_runtime_proxy:-${legacy_runtime_proxy:-$default_runtime_proxy}}"

existing_build_no_proxy="$(read_env_value "SLOTH_BUILD_NO_PROXY")"
existing_runtime_no_proxy="$(read_env_value "SLOTH_RUNTIME_NO_PROXY")"
legacy_build_no_proxy="$(read_env_value "BUILD_NO_PROXY")"
legacy_runtime_no_proxy="$(read_env_value "NO_PROXY")"

service_hosts="localhost,127.0.0.1,::1,host.docker.internal,sloth-cloud-paymenter,sloth-cloud-api,sloth-cloud-web,sloth-cloud-db,sloth-cloud-redis,sloth-convoy-web,sloth-convoy-php,sloth-convoy-workers,sloth-convoy-db,sloth-convoy-redis"
cluster_hosts="$default_master_host,$default_registry_host"
wsl_ipv4s="$(hostname -I | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | paste -sd, -)"

merged_no_proxy="$(merge_csv_list "$service_hosts" "$cluster_hosts" "$wsl_ipv4s" "$legacy_build_no_proxy" "$legacy_runtime_no_proxy" "$existing_build_no_proxy" "$existing_runtime_no_proxy")"

upsert_env_line "SLOTH_BUILD_HTTP_PROXY" "$build_proxy"
upsert_env_line "SLOTH_BUILD_HTTPS_PROXY" "$build_proxy"
upsert_env_line "SLOTH_BUILD_NO_PROXY" "$merged_no_proxy"
upsert_env_line "SLOTH_RUNTIME_HTTP_PROXY" "$runtime_proxy"
upsert_env_line "SLOTH_RUNTIME_HTTPS_PROXY" "$runtime_proxy"
upsert_env_line "SLOTH_RUNTIME_NO_PROXY" "$merged_no_proxy"

echo "Updated deploy/sloth-cloud/.env proxy settings."
echo "SLOTH_RUNTIME_HTTP_PROXY=$runtime_proxy"
echo "SLOTH_RUNTIME_NO_PROXY=$merged_no_proxy"
