import { all, get, run, transaction } from '../db/client.mjs';

// secrets table schema:
// kid TEXT PRIMARY KEY, project_id TEXT, type TEXT, value TEXT, active INTEGER, created_at INTEGER, rotated_at INTEGER

export async function listByProject(projectId) {
  const rows = all('SELECT kid, project_id, type, value, active, created_at, rotated_at FROM secrets WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
  return rows.map(r=>({ ...r, active: Number(r.active) }));
}

export async function getByKid(kid) {
  const r = get('SELECT kid, project_id, type, value, active, created_at, rotated_at FROM secrets WHERE kid = ?', [kid]);
  return r ? { ...r, active: Number(r.active) } : null;
}

export async function upsert(secret) {
  // secret: { kid, project_id, type='HMAC', value, active=1, created_at }
  // Implement rotation invariant: allow at most 2 active keys per project
  const now = Math.floor(Date.now()/1000);
  const tx = transaction((s)=>{
    // insert or replace secret
    run(`INSERT OR REPLACE INTO secrets (kid, project_id, type, value, active, created_at, rotated_at)
         VALUES (?,?,?, ?, ?, ?, ?)`,
        [s.kid, s.project_id, s.type || 'HMAC', s.value, s.active ? 1 : 0, s.created_at || now, s.rotated_at || null]);
    // count active keys
    const actives = all('SELECT kid FROM secrets WHERE project_id = ? AND active = 1 ORDER BY created_at DESC', [s.project_id]);
    if (actives.length > 2) {
      // deactivate oldest extras so only two newest remain active
      const toDeactivate = actives.slice(2).map(r=>r.kid);
      for (const k of toDeactivate) {
        run('UPDATE secrets SET active = 0, rotated_at = ? WHERE kid = ?', [now, k]);
      }
    }
  });
  tx(secret);
  return await getByKid(secret.kid);
}

export async function deactivate(kid, rotated_at=null) {
  const when = rotated_at ? Math.floor(rotated_at/1000) : Math.floor(Date.now()/1000);
  run('UPDATE secrets SET active = 0, rotated_at = ? WHERE kid = ?', [when, kid]);
  return await getByKid(kid);
}

export async function clear() {
  run('DELETE FROM secrets');
}
