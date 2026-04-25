# Integration Adapters

Sloth Cloud keeps upstream systems behind explicit adapter boundaries.

## PaymenterAdapter

Handles storefront and account operations:

- login and account lookup
- catalog and cart
- order and invoice flows

Paymenter tokens stay server-side in `apps/api`.

## ConvoyAdapter

Handles VPS infrastructure operations:

- server metadata and status
- console sessions
- power actions
- reinstall and password operations

Convoy must be deployed and licensed separately. This repository does not redistribute Convoy source code.

## AssistantProvider

Handles model-provider readiness and chat/completion calls through OpenAI-compatible APIs or CLI proxy services.

Provider credentials stay in environment variables such as `ASSISTANT_OPENAI_API_KEY` and are never exposed to the web app.

## OpenClawConnector

Optional connector for always-on or multi-channel bot workflows.

OpenClaw is not required for the core Sloth Cloud web product. When used, it should call Sloth Cloud APIs through a scoped token or webhook gateway.
