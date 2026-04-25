# Maintainer Guide

This guide is for people with write access to the public Sloth Cloud repository.

## Before Merging

Run or verify:

```bash
pnpm build
pnpm test:ci
pnpm run secret:scan
```

Also check that the PR does not add:

- `.env` files
- `runtime/`
- `node_modules/`
- `apps/*/dist`
- `Paymenter-master`
- `Convoy panel-develop`
- real provider keys, cookies, SSH keys, database dumps, logs, screenshots, or backups

## Review Hot Spots

Review especially carefully when a PR touches:

- Authentication and session handling
- Billing, invoices, orders, or Paymenter integration
- VPS control, console, reinstall, or Convoy integration
- Remote execution and deployment flows
- Assistant provider routing or model execution
- Preview verification, publishing, and health evidence
- Dockerfiles and CI workflows

## CI And Heavy Workflow Tests

Public CI runs the regular test suite plus a small hosted-runner-safe Operator smoke subset. The full Operator workflow integration suite is still available as:

```bash
pnpm test:ci:operator
```

Run the full Operator suite before release, before changing deployment routing, or on a dedicated runner. It creates many temporary git repositories and polls async preview/workflow state, so it is intentionally not part of the default public hosted-runner CI gate.

## Release Flow

1. Merge small, reviewed PRs into `main`.
2. Confirm CI is green.
3. Tag releases only from clean `main`.
4. Keep production secrets in the private deployment repository or secret manager.
5. Publish release notes that separate public source changes from private deployment changes.

## Handling Boundary Problems

If a contributor opens a PR with vendored upstream panel source or secrets:

1. Do not merge.
2. Ask them to remove the files from the branch history if secrets are involved.
3. Rotate any exposed credentials.
4. Point them to `docs/open-source-boundary.md` and `CONTRIBUTING.md`.
