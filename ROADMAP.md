# Roadmap

This roadmap describes public maintenance priorities. It is not a promise of delivery dates.

## Phase 1: Public Repository Hygiene

- Keep the public repository free of upstream panel source trees and runtime state.
- Maintain `secret:scan` and CI as required checks.
- Document Paymenter, Convoy, assistant provider, and OpenClaw integration boundaries.
- Keep `.env.example` files complete but secret-free.

## Phase 2: Stable Developer Experience

- Make local setup reliable with mock-safe development defaults.
- Improve adapter test coverage for unavailable and partial upstream states.
- Keep web/API build and test workflows fast enough for contributors.
- Add contributor-friendly troubleshooting docs.

## Phase 3: Operator and Assistant Honesty

- Keep normal chat and execution routing clearly separated.
- Prevent repo deployment from falling into generated/demo preview lanes.
- Require real runtime evidence before verified preview states.
- Make blocked deployment states recoverable through repair flows.

## Phase 4: Integration Ecosystem

- Provide stable adapter interfaces for billing, VPS control, assistant providers, and optional bot connectors.
- Add examples for self-hosted deployments without publishing private production configs.
- Encourage community-maintained adapters through documented contracts.

## Out of Scope for the Public Repo

- Vendored Paymenter, Convoy, OpenClaw, or CLI proxy source code.
- Real production credentials or customer data.
- Private deployment inventories and backups.
- Provider-specific secrets or billing account data.

