# Sloth Cloud

Sloth Cloud is an AI-assisted cloud workbench for VPS storefronts, customer operations, and application deployment workflows.

This public repository contains the Sloth Cloud-owned product shell:

- `apps/web`: React/Vite customer console and AI workbench UI.
- `apps/api`: Fastify BFF that normalizes upstream APIs and keeps provider credentials server-side.
- `docs`: product, operator, readiness, and implementation notes.
- `deploy/sloth-cloud/env/*.example`: safe configuration examples only.

It does **not** vendor Paymenter, Convoy, OpenClaw, CLIProxyAPI, production databases, runtime workspaces, generated projects, backups, screenshots, or secrets.

## Open Source Boundary

Sloth Cloud is designed as an integration layer. Upstream systems are external dependencies:

- Paymenter: optional billing/storefront backend. If you deploy or modify Paymenter, keep its upstream license and notices.
- Convoy: optional VPS/panel backend. Users must provide their own licensed Convoy deployment; this repository only contains a Convoy API adapter.
- OpenClaw: optional always-on bot/orchestration layer. This repository only exposes connector surfaces.
- CLI proxy / OpenAI-compatible APIs: optional model routing layer configured through environment variables.

See [NOTICE.md](./NOTICE.md) and [docs/open-source-boundary.md](./docs/open-source-boundary.md) before publishing forks or production deployments.

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

For local development:

```bash
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Default local ports:

- Web: `http://localhost:3300`
- API: `http://localhost:4000`

## Configuration

Never commit real `.env` files. Start from examples:

- API: [apps/api/.env.example](./apps/api/.env.example)
- Web: [apps/web/.env.example](./apps/web/.env.example)
- Deployment examples: [deploy/sloth-cloud/env](./deploy/sloth-cloud/env)

Assistant provider configuration is OpenAI-compatible:

```env
ASSISTANT_ENABLED=true
ASSISTANT_PRIMARY_PROVIDER=openai
ASSISTANT_OPENAI_BASE_URL=
ASSISTANT_OPENAI_API_KEY=
ASSISTANT_OPENAI_MODEL=gpt-5.4
```

In public/runtime mode, do not silently fall back to mock AI responses. If a provider is unavailable, the UI should state that execution is limited.

## Repository Hygiene

Before publishing or pushing changes:

```bash
pnpm run secret:scan
```

The scan blocks common high-risk leaks such as private keys, API keys, tokens, `.env` files, runtime workspaces, generated projects, and vendored upstream panel directories.

## Community Maintenance

Sloth Cloud is open to community maintenance around the public shell, BFF, operator workflow, adapter contracts, tests, and docs.

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR.
- Read [GOVERNANCE.md](./GOVERNANCE.md) to understand maintainer decisions and repository boundaries.
- Read [ROADMAP.md](./ROADMAP.md) for public maintenance priorities.
- Read [docs/public-private-deployment.md](./docs/public-private-deployment.md) before wiring real production infrastructure.

Please do not submit upstream panel source trees, production credentials, customer data, or private deployment state.

## License

Sloth Cloud-owned code in this repository is licensed under AGPL-3.0-or-later. See [LICENSE](./LICENSE).

Third-party systems and dependencies keep their own licenses and are not relicensed by this repository.
