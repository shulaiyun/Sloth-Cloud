#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET_DIR="$ROOT_DIR/runtime/data/kubeconfig"
TARGET_FILE="$TARGET_DIR/config"

usage() {
  cat <<'EOF'
Usage:
  deploy/sloth-cloud/scripts/wsl-sync-k3s-kubeconfig.sh <source> [api-server-url]

Examples:
  deploy/sloth-cloud/scripts/wsl-sync-k3s-kubeconfig.sh /etc/rancher/k3s/k3s.yaml https://192.168.16.220:6443
  deploy/sloth-cloud/scripts/wsl-sync-k3s-kubeconfig.sh root@192.168.16.220:/etc/rancher/k3s/k3s.yaml https://192.168.16.220:6443

The kubeconfig is written to:
  runtime/data/kubeconfig/config
EOF
}

SOURCE="${1:-}"
API_SERVER_URL="${2:-}"

if [[ -z "$SOURCE" ]]; then
  usage
  exit 1
fi

mkdir -p "$TARGET_DIR"

if [[ -f "$SOURCE" ]]; then
  cp "$SOURCE" "$TARGET_FILE"
else
  scp -o StrictHostKeyChecking=accept-new "$SOURCE" "$TARGET_FILE"
fi

if [[ -n "$API_SERVER_URL" ]]; then
  sed -E -i "s#^([[:space:]]*server:[[:space:]]*).*\$#\\1${API_SERVER_URL}#g" "$TARGET_FILE"
fi

chmod 600 "$TARGET_FILE"

echo "Managed App kubeconfig synced to $TARGET_FILE"
if grep -Eq '^[[:space:]]*server:[[:space:]]+https?://(127\.0\.0\.1|localhost)(:|/|$)' "$TARGET_FILE"; then
  echo "WARN: kubeconfig still points to a loopback API endpoint. Rewrite it to a reachable control-plane IP before provisioning."
fi
