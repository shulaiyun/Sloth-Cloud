# Open Source Boundary

Sloth Cloud should be open sourced as a clean integration product, not as a bundled copy of every system used in production.

## Public Repository

The public repository may contain:

- Sloth Cloud web UI.
- Sloth Cloud API/BFF code.
- Operator and assistant product shell.
- Adapter interfaces for Paymenter, Convoy, assistant providers, and optional bot connectors.
- Safe `.env.example` files.
- Documentation and tests that do not expose secrets or customer data.

## Private Deployment Repository

Keep these in a private repository or secret manager:

- Real `.env` files.
- Production Docker Compose overrides.
- Server addresses, SSH keys, API tokens, database credentials, and cookies.
- Paymenter, Convoy, OpenClaw, and CLI proxy runtime configuration.
- Backups, database dumps, logs, screenshots, generated project output, and operator runtime state.

## External Dependencies

Paymenter, Convoy, OpenClaw, and model proxy services are external systems. Sloth Cloud integrates through APIs and connector contracts.

Do not vendor upstream panel source code into this repository. If a deployment needs Convoy or Paymenter, document how to connect to an existing deployment instead of redistributing their code.

## Adapter Boundary

The intended dependency boundary is:

- `PaymenterAdapter`: authentication, catalog, cart, invoices, account flows.
- `ConvoyAdapter`: VPS status, console, power actions, reinstall, password, resize, server metadata.
- `AssistantProvider`: OpenAI-compatible model calls and provider readiness.
- `OpenClawConnector`: optional webhook or bot entrypoint for always-on workflows.

Adapters should hide upstream credentials inside `apps/api` and never expose them to `apps/web`.
