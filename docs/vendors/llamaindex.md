# LlamaIndex Remote Client

Bridge-Agent calls a remote LlamaIndex service over a signed HTTP client.

## Endpoints
POST /index/upsert -> { "docIds": ["doc_1"] }
POST /query -> { "nodes": [{ "id": "n1", "text": "...", "path": "lib/security/jwt.mjs", "span": { "start": 120, "end": 300 }, "score": 0.88 }] }

## Headers
x-vibe-project, x-vibe-kid, x-signature (sha256=<hex of raw body>), optional x-idempotency-key

## Timeouts and Retries
10s timeout; retries on transport, 5xx, and 429 with capped backoff; Retry-After honored (cap 2s).

## Env
LLAMAINDEX_URL, LI_TOP_K (default 3), LI_UPSERT_ON_PLAN (default false), VENDOR_HMAC_PROJECT, VENDOR_HMAC_KID, VENDOR_HMAC_KEY
