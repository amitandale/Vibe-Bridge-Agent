import { NextResponse } from 'next/server';
import { getRun } from '../../../../lib/ai/runs.mjs';

export async function GET(req) {
  const url = new URL(req.url);
  const runId = url.searchParams.get('runId');
  if (!runId) return NextResponse.json({ ok:false, code:'BAD_INPUT' }, { status:400 });
  const run = getRun(runId);
  if (!run) return NextResponse.json({ ok:false, code:'NOT_FOUND' }, { status:404 });
  return NextResponse.json({ ok:true, ...run });
}
