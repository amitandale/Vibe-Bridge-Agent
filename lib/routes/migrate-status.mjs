// lib/routes/migrate-status.mjs
import { ensureMigrations, status } from '../migrate/state.mjs';

export async function GET(req){
  await ensureMigrations();
  const s = status();
  const out = { ok: true, status: 'SUCCESS', applied: s.applied, pending: s.pending };
  if (s.lastApplied) out.lastApplied = s.lastApplied;
  return new Response(JSON.stringify(out), { status: 200, headers:{'content-type':'application/json'} });
}
