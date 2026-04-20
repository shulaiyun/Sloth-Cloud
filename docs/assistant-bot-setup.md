# Sloth Cloud Assistant Bot (v1)

## Overview
- Customer-operations assistant with full-site floating chat widget.
- Read-only diagnostics + low-risk auto actions.
- High-risk financial/runtime actions require confirmation token.

## API Endpoints
- `GET /api/v1/assistant/capabilities`
- `POST /api/v1/assistant/session`
- `POST /api/v1/assistant/messages`
- `POST /api/v1/assistant/actions/confirm`

## Required Env (apps/api)
Set in the env file that matches how you start the API:

- Local host dev: `apps/api/.env`
- Docker / compose runtime: `runtime/env/api.env`

```env
ASSISTANT_ENABLED=true
ASSISTANT_PRIMARY_PROVIDER=openai
ASSISTANT_PROVIDER_CHAIN=openai,gemini,claude
ASSISTANT_OPENAI_API_KEY=...
ASSISTANT_OPENAI_MODEL=gpt-5.4
ASSISTANT_OPENAI_BASE_URL=
ASSISTANT_CONFIRM_TTL_SECONDS=600
ASSISTANT_SESSION_TTL_SECONDS=86400
ASSISTANT_MAX_CONTEXT_MESSAGES=30
```

If no provider API key is configured yet, the assistant still works in fallback mode:
- real account/service/invoice facts
- real low-risk / high-risk action flow
- confirmation gate for risky actions
- rule-based reply text instead of cloud LLM output

Optional provider compatibility:

```env
ASSISTANT_GEMINI_API_KEY=
ASSISTANT_GEMINI_MODEL=gemini-2.5-pro-preview-05-06
ASSISTANT_GEMINI_BASE_URL=
ASSISTANT_CLAUDE_API_KEY=
ASSISTANT_CLAUDE_MODEL=claude-sonnet-4-0
ASSISTANT_CLAUDE_BASE_URL=
```

Optional support escalation:

```env
ASSISTANT_SUPPORT_WEB_URL=/tickets
ASSISTANT_TICKET_API_URL=
ASSISTANT_TICKET_API_TOKEN=
```

## Deploy
1. Update `apps/api/.env` for host dev, or `runtime/env/api.env` for docker runtime.
2. Restart the host API process or rebuild/restart the API and Web containers.
3. Open front-end and verify floating AI widget appears.
4. Verify:
   - guest user can ask FAQ.
   - logged-in user can query service/invoice status.
   - low-risk action can auto-execute.
   - high-risk action requires confirm.
