# ctxpack assemble

Deterministic ContextPack assembly with budgeting, deduplication, span‑merge, pointers, and reports.

## Usage

```bash
node scripts/ctxpack.mjs assemble --model <id> --in draft.json [--out pack.json] [--dry-run] [--report report.json]   [--budget.max_tokens N] [--budget.max_files N] [--budget.max_per_file_tokens N]   [--section.cap <section>=<tokens>,<files>] [--merge.max_tokens N] [--fail-on-warn]
```

Other commands:

```bash
node scripts/ctxpack.mjs validate <file.json>
node scripts/ctxpack.mjs hash <file.json>
node scripts/ctxpack.mjs print <file.json>
```

## Exit codes

- `0` success
- `2` schema/validation error
- `3` `BUDGET_ERROR` (must_include overflow)
- `4` determinism breach (development check)
- `1` other runtime error

Determinism check runs when `NODE_ENV=development` or `CTX_DETERMINISM_CHECK=1`.

## Flags

- `--model` tokenizer id for deterministic cost model
- `--report` write JSON report with metrics, evictions, pointers, and hash
- `--dry-run` do not write `--out`
- `--budget.max_tokens`, `--budget.max_files`, `--budget.max_per_file_tokens` override draft budgets
- `--section.cap <section>=<tokens>,<files>` repeatable per section
- `--merge.max_tokens` span merge upper bound
- `--fail-on-warn` turns warnings into non‑zero exit

## Invariants checked

- Canonical sort and stable hash
- All `must_include` fit or `BUDGET_ERROR`
- `never_include` excluded
- No duplicate ids in final pack
- Token and file metrics consistent with slices and merges
