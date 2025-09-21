# AutoGen Vendor Client

## Request

POST `${AUTOGEN_URL}/run-agents`

Headers:
- `content-type: application/json`
- `x-idempotency-key: <uuid>`
- `x-vibe-project: ${VENDOR_HMAC_PROJECT}`
- `x-vibe-kid: ${VENDOR_HMAC_KID}`
- `x-signature: sha256=<hexdigest(body)>`

Body:
```json
{
  "teamConfig": { "...": "..." },
  "messages": [{ "role": "user", "content": "..." }],
  "contextRefs": [{ "path": "file", "span": { "start": 0, "end": 10 }, "snippet": "..." }],
  "idempotencyKey": "uuid"
}
```

## Response

```json
{
  "transcript": [],
  "artifacts": {
    "patches": [{ "path": "a/b.js", "diff": "unified diff" }],
    "tests": [{ "path": "tests/generated/x.test.mjs", "content": "..." }]
  }
}
```

## Retries and timeout

- 10s timeout.
- 2 retries on 429 and 5xx with exponential backoff.
