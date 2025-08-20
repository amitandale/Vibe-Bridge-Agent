
# Bridge Agent — Security Contract & Runbook

The Bridge executes short actions **only** when authorized by Vibe‑CI.

## Security Contract

**Required on all privileged routes** (e.g., `/api/prs/open`, `/api/prs/comment`, `/api/heartbeat`):

- `x-signature`: `sha256=<HMAC>` over the raw body using a project‑scoped shared secret (provisioned by Vibe‑CI).
- `x-vibe-ticket`: short‑lived JWT (scope: `prs.open|prs.comment|bridge.heartbeat`) issued by Vibe‑CI.
- Optional: `x-vibe-project`: project id for auditing.

Requests **must** be rejected if:
- Signature missing/invalid
- Ticket missing/invalid/expired/replayed
- Local **disable** flag is set

## Heartbeat

**Route**: `POST /api/heartbeat`

Input (either):
- Header: `x-vibe-disable: true|1|false|0`
- JSON body: `{ "disable": true|false }`

Output:
```json
{ "ok": true, "disable": <bool> }
```

**Behavior**:
- When `disable=true`, set local kill‑switch so PR actions are refused until cleared.
- Always verify signature + ticket (scope: `bridge.heartbeat`).

## Deployment Profiles

- **Serverless**: keep handlers short; rely on vendor webhooks/polling for retries.
- **Long‑run**: background cron may re‑poll dropped webhooks within bounded windows.

## Local Dev

- `node --test` runs `.mjs` tests (unit). No server required.
- Security middleware exposes `requireBridgeGuards()` and `setDisabled()` for tests.
