import { requireBridgeGuardsAsync } from '../../../../lib/security/guard.mjs';
import { requireBridgeGuards } from '../../../../lib/security/guard.mjs';
import { NextResponse } from 'next/server';
import { createRun, updateRun } from '../../../../lib/ai/runs.mjs';
import { composePR } from '../../../../lib/ai/orchestrator/run.mjs';
import { append as appendLog } from '../../../../lib/logs/bus.mjs'; // PR-L1 logs

export async function POST(req) {
  const body = await req.json().catch(()=> ({}));
  const { projectRoot = process.cwd(), prompt = '', roster = [], ticket = null } = body || {};
  if (!prompt) return NextResponse.json({ ok:false, code:'BAD_INPUT' }, { status:400 });

  const runId = createRun({ projectRoot, prompt, roster, ticket });
  // Fire-and-forget (framework will keep the promise until response returns)
  (async () => {
    try {
      updateRun(runId, { phase:'RUNNING', step:1 });
      appendLog({ type:'llm', id: runId }, { level:'info', message:'Starting composePR' });
      const res = await composePR({
        projectRoot, prompt, roster, ticket,
        onLog: (e) => appendLog({ type:'llm', id: runId }, e)
      });
      updateRun(runId, { phase:'DONE', step:2, changedFiles: res.changedFiles, pr: res.pr });
      appendLog({ type:'llm', id: runId }, { level:'info', message:'composePR finished', meta: res });
    } catch (e) {
      updateRun(runId, { phase:'ERROR', step:2, errors: String(e && e.message || e) });
      appendLog({ type:'llm', id: runId }, { level:'error', message:'composePR failed', meta: { error: String(e) } });
    }
  })();

  return NextResponse.json({ ok:true, runId });
}
