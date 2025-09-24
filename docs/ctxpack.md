# ContextPack v1
Versioned, canonical JSON that defines all context sent to agents.
- Schema: lib/ctxpack/schema/contextpack.v1.schema.json
- Canonicalizer: lib/ctxpack/canonicalize.mjs
- Validator: lib/ctxpack/validate.mjs
- CLI: scripts/ctxpack.mjs
- Examples: assets/examples/ctxpack/*.json

Determinism: stable key order, UTF-8, full-pack hash.


## Integration
Set `CTXPACK_GATE=warn` to enable preflight in orchestrator before generation. The gate enforces schema, order, budgets, and hash. Build packs with `lib/ctxpack/builder.mjs` and enrich sections in later PRs.
