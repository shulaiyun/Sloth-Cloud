# Sloth Cloud WSL Operator Manual (VPS + Managed App Hosting)

This quick manual covers local WSL bootstrap for both product lines:
- VPS (Convoy + Paymenter)
- Managed App Hosting (Kubernetes runtime)

## 1. Where to fill Registry URL

Set your registry host in:
- `runtime/env/api.env`
- key: `MANAGED_APP_IMAGE_REGISTRY`

Example:

```env
MANAGED_APP_IMAGE_REGISTRY=192.168.16.101:30500
MANAGED_APP_IMAGE_REPOSITORY_PREFIX=sloth-managed-apps
```

Notes:
- Use host or host:port only (no `http://` or `https://`).
- Final image format is:
  `192.168.16.101:30500/sloth-managed-apps/service-<serviceId>:<tag>`

## 2. Required local Managed App env

In `runtime/env/api.env`:

```env
MANAGED_APP_ENABLED=true
MANAGED_APP_DRIVER=kubeconfig
MANAGED_APP_KUBECONFIG_PATH=/var/runtime/kubeconfig/config
MANAGED_APP_INTERNAL_API_TOKEN=sloth-managed-app-local-token
MANAGED_APP_IMAGE_REGISTRY=192.168.16.101:30500
MANAGED_APP_IMAGE_REPOSITORY_PREFIX=sloth-managed-apps
MANAGED_APP_INGRESS_CLASS=nginx
MANAGED_APP_CERT_ISSUER=letsencrypt-prod
MANAGED_APP_STORAGE_CLASS=standard
```

In `runtime/env/paymenter.env`:

```env
PROVISIONING_PROVIDERS=convoy,managed-app
MANAGED_APP_INTERNAL_API_URL=http://sloth-cloud-api:4000
MANAGED_APP_INTERNAL_API_TOKEN=sloth-managed-app-local-token
```

The `MANAGED_APP_INTERNAL_API_TOKEN` value must be identical in both files.

## 3. Use your Convoy templates for VPS products

Your template names (Ubuntu 22.04, Debian 12, AlmaLinux, RockyLinux, CentOS) are supported.

The redeploy scripts now support template and node overrides:

```bash
cd ~/code/vps
export SLOTH_VPS_TEMPLATE="Ubuntu 22.04"
export SLOTH_US_NODE_ID=1
export SLOTH_HK_NODE_ID=2
bash deploy/sloth-cloud/scripts/wsl-repair-local.sh
```

If you currently have only one node, set both node IDs to that node:

```bash
export SLOTH_US_NODE_ID=1
export SLOTH_HK_NODE_ID=1
```

## 4. Full local bootstrap command

```bash
cd ~/code/vps
bash deploy/sloth-cloud/scripts/wsl-full-redeploy.sh
```

This script does:
- Epay callback/return URL bootstrap
- notification template bootstrap
- managed app catalog bootstrap
- VPS US/HK 1c1g / 2c2g / 4c6g catalog bootstrap
- provisioning mapping sync
- queue processing and smoke checks

## 5. Common checks

- Payment callback/return (local):
  - Callback Base URL: `http://localhost:18080`
  - Frontend Return URL: `http://localhost:13000/invoices/{number}`
- Kubeconfig mount path:
  - `/var/runtime/kubeconfig/config`
- Kubernetes dependencies:
  - ingress class exists
  - cert-manager issuer exists
  - storage class exists
