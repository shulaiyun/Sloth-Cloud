# Contributing to Sloth Cloud

Thanks for helping make Sloth Cloud easier to run, safer to extend, and more useful for small teams.

## Project Boundary

This repository is the public Sloth Cloud shell and integration layer. Contributions should stay inside this boundary:

- Product UI and customer/operator workflows in `apps/web`.
- API/BFF, adapters, readiness checks, and orchestration logic in `apps/api`.
- Public docs, examples, tests, and safe development tooling.

Do not contribute:

- Paymenter, Convoy, OpenClaw, or CLI proxy source trees.
- Real `.env` files, tokens, SSH keys, cookies, customer data, database dumps, runtime workspaces, screenshots, logs, or backups.
- Production-only deployment files that contain private hostnames, IP addresses, credentials, or billing data.

## Development Setup

```bash
pnpm install
pnpm build
pnpm test
pnpm run secret:scan
```

Use example environment files only:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Never commit the copied `.env` files.

## Pull Request Checklist

Before opening a PR:

- Run `pnpm build`.
- Run `pnpm test`.
- Run `pnpm run secret:scan`.
- Keep changes focused on one topic.
- Update docs or examples when changing public behavior.
- Explain whether a change affects Paymenter, Convoy, assistant providers, deployment, or security boundaries.

## Adapter Contributions

Adapters must keep upstream systems replaceable. A good adapter PR should:

- Keep credentials server-side.
- Avoid importing upstream panel source code.
- Convert provider-specific responses into Sloth Cloud-owned types.
- Include tests for unavailable, partial, and failed upstream states.
- Document required environment variables with placeholders only.

## AI and Automation Contributions

Sloth Cloud should be honest about automation provenance:

- Do not make mock/demo responses look like live model output.
- Do not mark previews as verified without runtime, health, smoke, and screenshot evidence.
- If execution is unavailable, return a clear limited-mode response.
- Keep route decisions and raw logs out of the main user interface unless explicitly requested in debug views.

## Review Expectations

Maintainers may ask contributors to split large PRs. This is not a rejection; it keeps the project reviewable and safer to maintain.

