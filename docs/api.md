# Bridge Agent API Contracts

This document defines the internal security and retrieval contracts for the Bridge Agent. It does not add or expose any new public retrieval APIs.

## Security Headers

Required on all privileged routes (e.g., `/api/prs/open`, `/api/prs/comment`, `/api/heartbeat`):

- `x-signature`: `sha256=<hex>` HMAC over the raw body using a project‑scoped shared secret (rotated by control plane). Rotation grace window is 7 days by default.
- `x-vibe-ticket`: short‑lived JWT with RS256 signature. Claims include `iss`, `aud`, `exp`, and a scoped `perm` such as `prs.open`, `prs.comment`, or `bridge.heartbeat`.
- Optional: `x-vibe-project`: project id for auditing.

Requests must be rejected if the signature is missing or invalid, the ticket is missing or invalid, or the ticket scope does not match the route. See `lib/security/hmac.mjs` and `lib/security/jwt.mjs` for implementation.

## Provider Error Taxonomy

Provider adapters must map HTTP failures into a stable taxonomy. Current codes:

- `PROVIDER_UNAUTHORIZED` — credential missing or invalid (e.g., HTTP 401 from provider).
- `PROVIDER_FORBIDDEN` — permission denied (e.g., HTTP 403).
- `PROVIDER_RATE_LIMIT` — throttled (e.g., HTTP 429).
- `PROVIDER_RETRY` — retryable server error (e.g., HTTP 5xx).
- `PROVIDER_ERROR` — non‑specific provider error.

Adapters: see `lib/git/gh.mjs`, `lib/providers/gcp.mjs` and related tests.

## Internal Context Packer

The packer creates a deterministic, budget‑bounded context bundle with optional redaction. It has two providers behind a consistent API:

- Filesystem provider: `lib/context/pack.fs.mjs`
- LlamaIndex provider: `lib/context/pack.llamaindex.mjs` (selected with `CONTEXT_PROVIDER=llamaindex`)

### Budget

Default limits are identical for both providers:

- `maxChars`: **200 000**
- `maxFiles`: **50**

Callers may override these via the `budget` option. The packer always returns the actual usage `{ usedChars, usedFiles }` alongside artifacts.

### Redaction

Callers may pass a `redact(text) → text` function. The packer invokes it before counting bytes and before any artifact is emitted. The packer itself does not embed redaction rules; redaction policy is enforced by callers to keep the packer provider‑agnostic.

### Determinism

Both providers guarantee deterministic ordering. Files are traversed depth‑first with directory names sorted lexicographically; artifacts are sliced by remaining budget and returned in stable order.

## LlamaIndex Notes

When `CONTEXT_PROVIDER=llamaindex`, the packer builds a transient index from repo files with the same budget behavior and redaction callback. If LlamaIndex is not installed at runtime, the LlamaIndex packer will throw with an actionable message. The default provider remains filesystem (`fs`) when `CONTEXT_PROVIDER` is unset.
