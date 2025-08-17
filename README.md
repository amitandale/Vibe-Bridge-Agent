# Vibe Bridge Agent (Dev helper)

**Role:** Stateless “button‑pusher” per project. Receives a **Fixed‑Diff** request from Vibe CI, opens a GitHub branch + PR, and returns links. Runs on Vercel for dev (no prod requirement).

## v1 Features
- **Fixed‑Diff PR open**: HMAC‑signed payload → branch + commit + PR → `{ ok, prUrl }`
- **HMAC verification**: `x-signature: sha256=<hex>` over raw JSON body using `BRIDGE_SECRET`
- **Helpers** (skeletons in v1): `/api/helpers/reconcile`, `/api/helpers/automerge`, `/api/helpers/janitor`
- **No merges** by default; optional automerge if enabled later
- **Observability**: structured logs, requestId echo

## API (v1)
### `POST /api/run-agent` (Fixed‑Diff)
**Headers**: `content-type: application/json`, `x-signature: sha256=<hex>`  
**Body**:
```json
{ "owner": "acme", "repo": "web", "base": "main", "title": "Feat: X", "diff": "<unified diff>" }
```
**Response**:
```json
{ "ok": true, "prUrl": "https://github.com/acme/web/pull/123" }
```

## Environment
- `BRIDGE_SECRET` – HMAC shared with Vibe CI
- `GH_APP_ID`, `GH_PRIVATE_KEY` – GitHub App credentials
- (optional later) `VERCEL_TOKEN` if you fetch Preview URLs

## Security
- HMAC required; 401 on missing/invalid signature
- 413 on oversized bodies (set a sane cap, e.g., 1MB for v1)
- Allowlist `{owner}/{repo}` per deployment (recommended)

## Local Dev
```bash
curl -XPOST $BRIDGE_URL/api/run-agent \
  -H "content-type: application/json" \
  -H "x-signature: sha256=<hmac>" \
  --data '{ "owner":"acme","repo":"web","base":"main","title":"Test","diff":"--- a\n+++ b\n" }'
```

## CI & Tests
- **Unit**: Node’s `node --test` (see `tests/*.test.mjs`) – HMAC, contract edges
- **GitHub Actions**: `.github/workflows/ci-tests.yml` (find‑based runner)
- **Playwright ready**: `playwright.config.js` + `.github/workflows/e2e.yml` with placeholder spec

## v1 PRs (Bridge)
1. **BA‑01** GitHub App auth + PR open (Fixed‑Diff)  
2. **BA‑02** Reconcile + Automerge skeletons (read‑only checks)  
3. **BA‑03** Request guards (size/timeouts), rate‑limit, logging taxonomy  
4. **BA‑04** Docs & cURL examples

## Notes
- Bridge **does** PR orchestration in dev; Vibe CI **does not** merge code.
- In prod, Bridge is not required; user apps live on their infra.
