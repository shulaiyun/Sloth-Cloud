# Operator V3 Migration

## Current Cutover

- `/operator` -> `OperatorV3Page`
- `/operator/:capsuleId` -> `OperatorV3Page`
- `/operator/debug` -> `OperatorHubPage`
- `/operator/debug/:capsuleId` -> `OperatorHubPage`
- `/workspaces/:capsuleId` -> redirect to `/operator/:capsuleId`
- `/capsules/:capsuleId` -> redirect to `/operator/:capsuleId`

## What Changed

- `operator-v3` is now the default user-facing shell.
- `OperatorHubPage` is no longer the main product surface.
- The old page remains available as `debug/reference` for one release cycle.

## Release Cycle Plan

1. This release:
   - keep `OperatorHubPage` reachable only through `/operator/debug*`
   - collect screenshot evidence and manual regression checks against both routes
   - use `operator-v3` for all user-facing flows

2. Next release:
   - freeze old debug page to bugfix-only
   - verify no internal links or docs still point users to the debug route
   - compare failure handling, continuation, and verified gating against real usage

3. Removal gate:
   - remove old `OperatorHubPage` only after one stable release cycle
   - require no blocker on:
     - draft persistence
     - optimistic send
     - same-workspace artifact continuation
     - details drawer replacement coverage
     - verified gate parity

## Deletion Candidate Scope

- `apps/web/src/pages/OperatorHubPage.tsx`
- `apps/web/src/pages/OperatorHubPage.test.tsx`
- `apps/web/src/components/operator/OperatorWorkflowLayout.tsx`
- old `operator-console-*` debug-first UI branches that no longer serve `operator-v3`
