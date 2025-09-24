# ContextPack v1

Single source of truth for agent context. Deterministic, budgeted, and hashable.

## CLI
```bash
node bin/ctxpack.mjs validate examples/contextpack.pr.json
node bin/ctxpack.mjs hash examples/contextpack.pr.json
node bin/ctxpack.mjs print examples/contextpack.pr.json
```

## Gate
```bash
# default warn
node scripts/preflight/ctxpack.gate.mjs examples/contextpack.pr.json
# enforce
BRIDGE_CTXPACK_ENFORCE=1 node scripts/preflight/ctxpack.gate.mjs examples/contextpack.pr.json
```
