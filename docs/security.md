# Security store and migrations

- SQLite file: `./data/bridge-agent.db` with `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`, `busy_timeout=5000`.
- Migration runner applies `lib/db/sql/*.sql` in order and records checksums in `migration` table.
- Admin routes remain ticket-protected; HMAC never exposed here.
- Replay protection uses DB-backed nonces.
