# AutoGen Vendor Client

Thin client around `lib/vendors/http.mjs`.

## Request
POST `${AUTOGEN_URL}/agents/run` with JSON:
```json
{ "teamConfig": {}, "messages": [], "contextRefs": [], "idempotencyKey": "..." }
```

Headers include:
- `x-vibe-project`
- `x-vibe-kid`
- `x-signature` (sha256 over body)

Timeout 10s. Retries on 429 and 5xx with backoff.

## Response
```json
{
  "transcript": [ { "role": "system", "content": "..." } ],
  "artifacts": {
    "patches": [ { "path": "lib/a.mjs", "diff": "..." } ],
    "tests": [ { "path": "tests/generated/x.test.mjs", "content": "..." } ]
  }
}
```
