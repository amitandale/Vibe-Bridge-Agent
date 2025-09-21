# AutoGen Vendor Client

Thin HTTP client used by Bridge-Agent to call an external AutoGen service.

## Endpoint
`POST ${AUTOGEN_URL}/runAgents`

## Request body
```json
{
  "teamConfig": { "...": "..." },
  "messages": [ { "role": "user", "content": "..." } ],
  "contextRefs": [ { "path": "docs/a.md", "span": {"start": 0, "end": 120}, "snippet": "..." } ],
  "idempotencyKey": "session|plan|commit id"
}
```

## Required headers
- `x-vibe-project`: project id
- `x-vibe-kid`: key id
- `x-signature`: `sha256=<hex>` HMAC over the raw JSON body using `VENDOR_HMAC_KEY`

Content type: `application/json`

## Env
- `AUTOGEN_URL` (required in dev/staging)
- `VENDOR_HMAC_PROJECT`, `VENDOR_HMAC_KID`, `VENDOR_HMAC_KEY`
- `AUTOGEN_TIMEOUT_MS` (default 10000)
- `AUTOGEN_RETRIES` (default 2)

## Retries and timeout
- Retries on 429 and 5xx with exponential backoff
- Total attempts: 1 + AUTOGEN_RETRIES
- Per-attempt timeout: AUTOGEN_TIMEOUT_MS

## Response body
```json
{
  "transcript": ["..."],
  "artifacts": {
    "patches": [ { "path": "README.md", "diff": "unified diff" } ],
    "tests":   [ { "path": "tests/generated/x.test.mjs", "content": "..." } ]
  }
}
```

## Error mapping
- 429/5xx/timeout → `UPSTREAM_UNAVAILABLE`
- 400 → `BAD_REQUEST`
- 401 → `UNAUTHORIZED`
- 403 → `FORBIDDEN`
- 404 → `NOT_FOUND`
- Others → `BAD_UPSTREAM`
