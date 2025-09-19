# LlamaIndex Remote Client

Bridge-Agent uses a signed HTTP client to talk to a remote LlamaIndex service.

## Endpoints
- `POST /index/upsert` → `{ docIds: string[] }`
- `POST /query` → `{ nodes: [{ id, text, path, span: { start, end }, score? }] }`

## Headers
- `x-vibe-project`: project scope
- `x-vibe-kid`: HMAC key id
- `x-signature`: `sha256=<hex>` over raw body bytes
- Optional `x-idempotency-key`

## Timeouts & Retries
- 10s timeout per request
- Retries on transport/5xx/429 with capped backoff
- `Retry-After` honored and capped at 2s

## Env
- `LLAMAINDEX_URL` (required outside CI)
- `LI_TOP_K` default 3
- `LI_UPSERT_ON_PLAN` default false
- HMAC:
  - `VENDOR_HMAC_PROJECT`
  - `VENDOR_HMAC_KID`
  - `VENDOR_HMAC_KEY`

## Example
```js
import { makeLlamaIndexClient } from '../../lib/vendors/llamaindex.client.mjs';
const client = makeLlamaIndexClient(); // reads env when not provided
await client.upsert({
  projectId: 'proj_123',
  docs: [{ path: 'src/a.js', mime: 'text/javascript', content: '...' }],
  idempotencyKey: 'plan-123'
});
const out = await client.query({ projectId: 'proj_123', query: 'how jwt works?', k: 3 });
console.log(out.nodes);
```
