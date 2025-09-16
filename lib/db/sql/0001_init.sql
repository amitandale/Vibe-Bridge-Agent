-- lib/db/sql/0001_init.sql
BEGIN;
PRAGMA foreign_keys=ON;
-- Core migration history table is created by migrate() if missing. Schema objects follow.
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_owner TEXT,
  repo_name TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS secret (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kid TEXT NOT NULL,
  value TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(project_id) REFERENCES project(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nonce (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  ttl_s INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  pr_budget INTEGER NOT NULL DEFAULT 0,
  per_pr_ms INTEGER NOT NULL DEFAULT 0,
  roster_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'running',
  FOREIGN KEY(project_id) REFERENCES project(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  idempotency_key TEXT,
  FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pr (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  branch TEXT NOT NULL,
  url TEXT,
  state TEXT NOT NULL DEFAULT 'open',
  last_commit TEXT,
  FOREIGN KEY(project_id) REFERENCES project(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(project_id) REFERENCES project(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  chan TEXT,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  meta_json TEXT,
  FOREIGN KEY(project_id) REFERENCES project(id) ON DELETE CASCADE
);
COMMIT;
