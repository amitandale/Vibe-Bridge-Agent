# Bridge Agent

Per-project, stateless service deployed on the user's Vercel. **The only component that writes to GitHub.** Also hosts small "helpers" (cron/queue) to keep dev workflows smooth.

## Endpoints
- `POST /api/run-agent` — Apply unified diff, create/update PR (HMAC required) — (existing)
- `POST /api/init-repo` — Create initial private repo + seed files + open scaffold PR (HMAC).
- `POST /api/helpers/reconcile` — Re-poll check runs / preview URLs (small jobs).
- `POST /api/helpers/automerge` — If label `automerge:on-green` and policy passed, merge.
- `POST /api/helpers/janitor` — Close stale PRs/branches (optional policy).

## Environment (Vercel)
- `BRIDGE_SECRET` — HMAC shared with Vibe CI.
- `GH_APP_ID`, `GH_PRIVATE_KEY` — GitHub App credentials for write operations.
- (Optional) Upstash/Queue/KV envs for retries and small schedules.

## Security & Limits
- HMAC required on all write endpoints (`x-signature: sha256=<hmac>`).
- Rate-limit by project; cap diff size, hunk count; block binary patches.
- All long/heavy tasks must **not** run here; use the user's GitHub Actions or queues.
