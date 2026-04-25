# Notice

This repository contains Sloth Cloud-owned source code, adapters, user interface code, and documentation.

## External Systems

The following systems may be used by a Sloth Cloud deployment, but are not included in this repository and are not relicensed here:

- Paymenter: billing, catalog, orders, invoices, and customer account flows.
- Convoy: VPS/panel infrastructure operations.
- OpenClaw: optional always-on bot/orchestration layer.
- CLI proxy / OpenAI-compatible model gateways: optional model routing layer.
- Cloudflare, Kubernetes, registries, and other infrastructure providers.

Deployers must install, configure, and license these systems separately.

## No Vendored Panel Source

Do not copy upstream panel source trees into this repository. In particular, do not commit directories such as:

- `Paymenter-master`
- `Convoy panel-develop`
- `OpenClaw`
- `CLIProxyAPI-main`

Use documented APIs, connectors, or adapters instead.

## No Runtime Data

Do not commit production state, generated workspaces, database dumps, screenshots, backups, SSH keys, API tokens, customer data, or `.env` files.

Runtime artifacts belong in a private deployment repository or secret manager.
