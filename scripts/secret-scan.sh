#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  printf 'secret-scan failed: %s\n' "$1" >&2
  exit 1
}

if find . \
  -path './node_modules' -prune -o \
  -path './.git' -prune -o \
  -name '.env' -print | grep -q .; then
  fail 'real .env files are not allowed in the public repository'
fi

for forbidden in \
  './runtime' \
  './Convoy panel-develop' \
  './Paymenter-master' \
  './OpenClaw' \
  './CLIProxyAPI-main'; do
  if [ -e "$forbidden" ]; then
    fail "forbidden runtime or upstream source path exists: $forbidden"
  fi
done

SECRET_PATTERNS='(-----BEGIN [A-Z ]*PRIVATE KEY-----|(^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}|(^|[^A-Za-z0-9])ghp_[A-Za-z0-9_]{20,}|(^|[^A-Za-z0-9])github_pat_[A-Za-z0-9_]{20,}|(^|[^A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})'

if rg -n --hidden \
  --glob '!node_modules/**' \
  --glob '!.git/**' \
  --glob '!apps/*/dist/**' \
  --glob '!pnpm-lock.yaml' \
  --glob '!scripts/secret-scan.sh' \
  "$SECRET_PATTERNS" . | rg -v 'placeholder|example|EXAMPLE'; then
  fail 'possible secret material found; replace real values with empty placeholders or example text'
fi

printf 'secret-scan passed: public repository boundary looks clean.\n'
