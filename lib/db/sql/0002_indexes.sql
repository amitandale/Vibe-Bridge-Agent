-- lib/db/sql/0002_indexes.sql
BEGIN;
CREATE INDEX IF NOT EXISTS idx_secret_project_active ON secret(project_id, active);
CREATE INDEX IF NOT EXISTS idx_nonce_expiry ON nonce(seen_at, ttl_s);
CREATE INDEX IF NOT EXISTS idx_event_project_ts ON event(project_id, ts);
CREATE INDEX IF NOT EXISTS idx_log_project_ts ON log(project_id, ts);
CREATE INDEX IF NOT EXISTS idx_job_session_state ON job(session_id, state);
COMMIT;
