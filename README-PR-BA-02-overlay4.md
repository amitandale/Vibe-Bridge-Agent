PR-BA-02 overlay 4 - wiring and ticket integration improvements.

What's included:
- guard.mjs now attempts to use lib/security/jwt.mjs verifyJwt(token) if present.
  This integrates with existing JWT verification in your codebase if available.
- Advanced wiring script scripts/patch/wire-hmac-advanced.mjs that safely patches app/api write handlers.
  It creates .hmac-backup with originals and marks injected handlers with // HMAC-INJECTED.
- Revert script scripts/patch/revert-hmac-patches.mjs to restore originals from backup.
- This overlay still does NOT modify package.json or CI. You must install 'better-sqlite3' locally/CI.
- Manual review required after running the patch script. Check for correct relative import path and ensure `request` variable is used in handler signature.
How to run:
1) cd to repo root
2) node scripts/patch/wire-hmac-advanced.mjs
3) review files under app/api for // HMAC-INJECTED and commit the ones you accept
4) run tests: npm ci && npm test
Reverting:
node scripts/patch/revert-hmac-patches.mjs
