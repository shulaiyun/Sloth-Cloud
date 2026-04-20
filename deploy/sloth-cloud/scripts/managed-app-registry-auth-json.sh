#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  managed-app-registry-auth-json.sh <registry> <username> <password> [email]

Examples:
  managed-app-registry-auth-json.sh registry.example.com sloth-bot 'secret' 'ops@example.com'

Output:
  Prints a Docker config JSON payload suitable for MANAGED_APP_REGISTRY_AUTH_JSON.
EOF
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 3 ]]; then
  usage
  exit 1
fi

registry="${1%/}"
username="$2"
password="$3"
email="${4:-sloth-cloud@example.com}"

if [[ -z "$registry" || -z "$username" || -z "$password" ]]; then
  usage
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required for JSON escaping" >&2
  exit 1
fi

node -e '
const [registry, username, password, email] = process.argv.slice(1);
const auth = Buffer.from(`${username}:${password}`).toString("base64");
const payload = {
  auths: {
    [registry]: {
      username,
      password,
      email,
      auth,
    },
  },
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
' "$registry" "$username" "$password" "$email"
