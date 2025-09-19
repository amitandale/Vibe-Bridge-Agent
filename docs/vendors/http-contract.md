# Vendor HTTP Contract

Standardized client for outbound calls to MARTI, AutoGen, LlamaIndex, and OpenDevin/OpenHands.

## Headers and Signing
Each request includes:

- `x-vibe-project: <projectId>`
- `x-vibe-kid: <kid>`
- `x-signature: sha256=<hexdigest>` where hex is HMAC-SHA256 over the **raw body bytes** using the shared key.
- Optional: `x-idempotency-key: <uuid>` when provided.

## Timeouts
Default request timeout is 10s via `AbortController`. Override per call with `timeoutMs`.

## Retries
Retries on transport errors, 5xx and 429. Total attempts: 2. Backoff uses `250ms * 2^n` with jitter, capped at 2s. `Retry-After` is honored for 429 (capped at 2s).

## Error Taxonomy
HTTP and transport errors map to codes from `lib/obs/errors.mjs`:

- 400 → `BAD_REQUEST`
- 401 → `UNAUTHENTICATED`
- 403 → `FORBIDDEN`
- 404 → `NOT_FOUND`
- 429 → `RATE_LIMITED`
- 5xx or network/abort → `UPSTREAM_UNAVAILABLE`
- otherwise → `INTERNAL`

The client throws `HttpError` with `{ code, status, message }`.

## Example
```js
import { makeHttp } from '../lib/vendors/http.mjs';
import { getVendorConfig } from '../lib/vendors/config.mjs';

const marti = makeHttp({ ...getVendorConfig('marti'), fetchImpl: globalThis.fetch });

const res = await marti.post('/v1/plan', { 
  body: { input: 'hello' },
  idempotencyKey: '123e4567-e89b-12d3-a456-426614174000',
  timeoutMs: 5000
});

if (res.ok) {
  console.log('data', res.data);
}
```
