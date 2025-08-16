# Bridge Agent — Fixed-Diff PR (MVP)
## Required env (Vercel)
- `BRIDGE_SECRET`
- `GH_APP_ID`
- `GH_PRIVATE_KEY` (multiline, escape newlines as \n)

## Test (curl)
```bash
BODY='{"mode":"fixed-diff","owner":"YOUR_ORG","repo":"YOUR_REPO","base":"main","title":"vibe: test","diff":"diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1,1 +1,2 @@\n-Hello\n+Hello\n+World\n"}'
SIG=$(printf "%s" "$BODY" | openssl dgst -sha256 -hmac "$BRIDGE_SECRET" | sed 's/^.* //')
curl -sS -X POST "$BRIDGE_URL" \
  -H "content-type: application/json" \
  -H "x-signature: sha256:$SIG" \
  --data "$BODY"
```
