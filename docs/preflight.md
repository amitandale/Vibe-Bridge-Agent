# Preflight (PR-1 skeleton)

Warn-only pre-invoke preflight pipeline. No side effects.

## Env
- `PREINVOKE_ENFORCE=false` — when `true`, incompat/health failures set `ok=false`.
- `PREINVOKE_HEALTH_TIMEOUT_MS=2000` — health probe timeout per request.

## API
`runPreflight({ endpoints, compatMatrix, enforce?, timeoutMs? })` →
```json
{ "ok": true, "warnings": [], "details": { "services": { "name": { "status": "ok|degraded", "httpStatus": 200 } } } }
```
