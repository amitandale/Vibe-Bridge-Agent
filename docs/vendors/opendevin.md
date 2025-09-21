# OpenDevin/OpenHands Client

Thin HTTP client used by Bridge-Agent to:
- Prepare GitHub PRs
- Execute sandboxed commands

## Endpoints
- `POST /github/prepare_pr` → `{ prNumber, branchUrl, htmlUrl }`
- `POST /exec/run` → `{ stdout, stderr, exitCode, durationMs }`

## Headers
- `x-vibe-project`, `x-vibe-kid`, `x-signature` (`sha256=<hex>` over raw body)
- Optional: `x-idempotency-key`

## Timeouts and Retries
- Default timeout: 10s
- Retries: up to 2 on 429 and 5xx; honors `Retry-After`

## Errors
Mapped to Bridge taxonomy where available: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `INTERNAL`.

## Example
```js
import opendevin from '../../lib/vendors/opendevin.client.mjs';

const pr = await opendevin.preparePr({ owner, repo, base, branch, title, body, labels });
const run = await opendevin.exec({ cwd, shell: 'bash', commands: ['npm ci'], env: { CI: 'true' }, timeoutMs: 60000 });
```
