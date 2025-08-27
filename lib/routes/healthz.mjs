// lib/routes/healthz.mjs
import { ensureMigrations, status } from '../migrate/state.mjs';

export async function GET(req){
  await ensureMigrations();
  const s = status();
  const body = { ok: true, status: 'ready' };
  if (process.env.DATABASE_URL) body.db = true;
  return new Response(JSON.stringify(body), { status: 200, headers:{'content-type':'application/json'} });
}
