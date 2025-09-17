import { requireBridgeGuardsAsync } from '../../../../lib/security/guard.mjs';
import { requireBridgeGuards } from '../../../../lib/security/guard.mjs';
// Bridge-Agent: optional log ingest endpoint (internal)
import { append } from '../../../../../lib/logs/bus.mjs';
import { NextResponse } from 'next/server';
export async function POST(req){
  let body = {};
  try { body = await req.json(); } catch {}
  const { type, id, level='info', message='', meta } = body || {};
  if (!type || !id) return NextResponse.json({ ok:false, code:'BAD_INPUT' }, { status:400 });
  const e = append({ type, id }, { level, message, meta });
  return NextResponse.json({ ok:true, seq: e.seq });
}
