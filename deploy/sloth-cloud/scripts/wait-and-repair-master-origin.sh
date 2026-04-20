#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REPAIR_SCRIPT="${ROOT_DIR}/deploy/sloth-cloud/scripts/repair-cloudflare-origin-on-master.sh"
REMOTE_HOST="${REMOTE_HOST:-root@192.168.16.220}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "[attempt ${attempt}/${MAX_ATTEMPTS}] probing ${REMOTE_HOST}..."
  if sshpass -p "${REMOTE_PASS:-Atygcvb689*}" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$REMOTE_HOST" 'echo ok' >/dev/null 2>&1; then
    echo "remote host reachable, running repair script"
    exec "${REPAIR_SCRIPT}"
  fi
  attempt=$((attempt + 1))
  sleep "$SLEEP_SECONDS"
done

echo "remote host did not become reachable in time" >&2
exit 1
