

## Edge cases implemented
- Renames → provenance includes old and new paths.
- Migrations (*.sql, migrations/*) → `contracts` section and `must_include` with reason `migration`.
- No tests found → test linker still attempts basename mapping; omissions reported in CLI dry-run if budgets drop items.
- Global budget enforcement drops `extras` → `linked_tests` → `templates` → `spec_canvas`; never drops `diff_slices` or `contracts`.
- Deterministic sorting across items and `must_include`.
