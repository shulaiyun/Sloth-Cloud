# Public and Private Deployment Split

Sloth Cloud should be maintained as public source plus private deployment state.

## Public Repository

The public repository contains:

- Web UI
- API/BFF
- Operator workflows
- Adapter interfaces
- Tests
- Public docs
- Safe `.env.example` files

It must not contain:

- Real `.env` files
- Provider keys
- Customer data
- Paymenter or Convoy source trees
- Runtime workspaces
- Generated projects
- Backups, logs, screenshots, or database dumps

## Private Deployment Repository

A private deployment repository may contain:

- Production compose files
- Real environment files
- Host inventory
- Provider credentials
- OpenClaw and CLI proxy connection details
- Private operational runbooks
- Backup metadata

Recommended local skeleton:

```text
sloth-cloud-deploy-private/
  env/
  notes/
  README.md
```

## Adapter Boundary

Public Sloth Cloud code should talk to external systems through adapters:

- `PaymenterAdapter`: billing, catalog, orders, invoices, accounts.
- `ConvoyAdapter`: VPS power, console, reinstall, password, and status operations.
- `AssistantProvider`: OpenAI-compatible or CLI-proxy-compatible model calls.
- `OpenClawConnector`: optional webhook or bot entrypoint.

Adapters may define contracts and examples in public. Real endpoints and keys stay private.

