-- lib/db/sql/0003_seed_admin.sql
BEGIN;
INSERT OR IGNORE INTO project(id, name, created_at, updated_at)
VALUES ('admin', 'Admin', strftime('%s','now'), strftime('%s','now'));
COMMIT;
