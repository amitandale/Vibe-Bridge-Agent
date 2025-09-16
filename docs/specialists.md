# Specialists Harness Retrieval

- `lib/specialists/retrieve.mjs` exposes `retrieve(ctx, query, { maxTokens })`.
- Caps are strict. Default cap derives from `SPECIALIST_CONTEXT_CAP_TOKENS` or `PLAN_PACK_BYTES`.
- Calls BA-32 packer with `retriever: null` to avoid any network usage for specialists.
- Output artifacts are sorted deterministically by `path` then length.
