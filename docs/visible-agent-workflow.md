# Visible Agent Workflow

## Goal

Refactor the operator experience from "chat first, dump results later" into a visible workflow that shows what the system is doing at each stage:

- parsing
- grounded preflight
- planning
- confirmation
- execution
- verification
- blockers / failure diagnosis
- next step

The UX target is closer to Codex than a generic assistant chat window: the user should see stage conclusions, evidence, and next actions without seeing private chain-of-thought.

## State Machine

Every workflow task uses the same stage model:

`draft -> parsing -> preflight -> llm_planning -> awaiting_confirmation -> queued -> running -> verifying -> partial_success | success | failed | blocked | rolled_back`

This state is persisted per workspace task and exposed in the operator envelope.

## Persistence Model

The durable ledger now lives in `OperatorEnvelope.workflow` and stores:

- `planningMode`
- `activeTaskId`
- `tasks[]`

Each task stores:

- `thread`
- `draft`
- `userIntent`
- `parsedInput`
- `currentStage`
- `timeline`
- `evidence`
- `diagnostics`
- `artifacts`
- `deployReadiness`
- `publishHistory`
- `failure`
- `pendingConfirmation`

The implementation is in:

- `/Users/shulai/Documents/New project/vps/apps/api/src/lib/operator.ts`

## Timeline Cards

Every visible stage card has:

- `id`
- `kind`
- `stage`
- `title`
- `summary`
- `evidence[]`
- `nextStep`
- `source`
- `failureCode`

Supported card kinds:

- `user_message`
- `understanding`
- `preflight`
- `plan`
- `confirmation`
- `execution`
- `verification`
- `failure_diagnosis`
- `next_step`

## Grounded Repo Preflight

Repository flows now run a real read-only preflight before any build is allowed:

- clean repo URL capture
- `git ls-remote`
- reachability / auth / proxy classification
- package manager detection
- monorepo / workspace detection
- app entry detection
- build / dev / preview candidate collection
- env checklist scan
- confidence scoring

If confidence is too low, the system stops with a structured failure instead of guessing build commands.

## Failure Taxonomy

Structured failure codes now supported by the workflow model:

- `repo_url_invalid`
- `repo_unreachable`
- `repo_auth_failed`
- `github_proxy_aborted`
- `package_manager_unknown`
- `workspace_detection_failed`
- `build_command_uncertain`
- `build_script_missing`
- `unsupported_stack`
- `compose_recipe_missing`
- `env_missing`
- `static_preview_only`
- `preview_failed`
- `ssh_missing_credentials`
- `ssh_auth_failed`
- `deploy_blocked`

The right panel consumes:

- `failureCode`
- `humanSummary`
- `probableRootCause`
- `recommendedActions`
- `evidence`

## Planning Mode Rules

`planningMode = on`

- always emit a full plan first
- stop at `awaiting_confirmation` before any write / install / build / preview / deploy / server mutation

`planningMode = off`

- still do parsing + read-only grounded preflight first
- still stop at confirmation before any mutating step

## Same-Workspace Continuity

Idea flows now reuse the same workspace across:

- idea
- plan
- scaffold
- preview
- deploy readiness

This prevents the old "deploy feels like a new conversation" problem.

## Main Files

- `/Users/shulai/Documents/New project/vps/apps/api/src/lib/operator.ts`
- `/Users/shulai/Documents/New project/vps/apps/api/src/index.ts`
- `/Users/shulai/Documents/New project/vps/apps/web/src/lib/operator-types.ts`
- `/Users/shulai/Documents/New project/vps/apps/web/src/lib/types.ts`
- `/Users/shulai/Documents/New project/vps/apps/web/src/pages/OperatorHubPage.tsx`
- `/Users/shulai/Documents/New project/vps/apps/api/src/lib/operator-visible-workflow.test.ts`

## Verification

Core checks for this refactor:

- `pnpm -C /Users/shulai/Documents/New project/vps test`
- `pnpm -C /Users/shulai/Documents/New project/vps typecheck`
- `pnpm -C /Users/shulai/Documents/New project/vps build`

The screenshot script was also updated to capture the visible timeline and structured truth panel.
