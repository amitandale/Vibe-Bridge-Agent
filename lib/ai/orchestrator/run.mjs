import { loadOrchestrator, loadSpecialists, loadDefaultRoster } from '../prompts/loader.mjs';
import { createToolBroker } from '../tools/broker.mjs';
import { runClaudeSession } from '../claude/cli-bridge.mjs';
import { createWorktree } from '../../git/worktree.mjs';
import { openPullRequest } from '../../git/gh.mjs';
import { gate } from '../../ctxpack/enforce.mjs';
import { buildPack } from '../../ctxpack/builder.mjs';

async function ensureCtxpackGate({ projectRoot, onLog }) {
  const mode = process.env.CTXPACK_GATE || 'off';
  if (mode === 'off') return;
  // Minimal pack; pipelines will enrich in follow-ups.
  const pack = buildPack({
    projectId: process.env.PROJECT_ID || 'unknown',
    pr: { id: process.env.PR_ID || 'unknown', branch: process.env.GIT_BRANCH || 'work', commit_sha: process.env.GIT_COMMIT || 'deadbee' },
    mode: process.env.CTXPACK_MODE || 'PR',
    sections: [],
  });
  try {
    gate(pack, { mode });
    onLog?.({ level:'info', message:'ctxpack gate ok', meta:{ mode } });
  } catch (e) {
    onLog?.({ level:'error', message:'ctxpack gate failed', meta:{ code: e.code, message: e.message } });
    throw e;
  }
}


function buildPrBody({ prompt, changes, testsSummary }) {
  const files = (changes || []).map(c => `- ${c.path}`).join('\n');
  return [
    '## Plan',
    '',
    prompt || '(generated)',
    '',
    '## Changes',
    '',
    files || '(no files)',
    '',
    '## Tests',
    '',
    testsSummary || 'All project tests will run in CI.',
    '',
    '## Rollback',
    '',
    'Revert this PR or delete the created branch.'
  ].join('\n');
}

export async function composePR({ projectRoot, prompt, roster, ticket, maxSteps = 30, onLog = () => {} }) {
  const toolBroker = createToolBroker({ root: projectRoot });
  const orch = await loadOrchestrator();
  const chosen = roster && roster.length ? roster : await loadDefaultRoster();
  const specs = await loadSpecialists(chosen);

  const wt = await createWorktree({ projectRoot });
  onLog({ level:'info', message:`Worktree created at ${wt.root}` });

  async function onToolCall(call) {
    const { name, args } = call || {};
    onLog({ level:'debug', message:`tool:${name}`, meta: args });
    switch (name) {
      case 'ls':   return toolBroker.ls(args?.path || '.');
      case 'read': return toolBroker.read(args?.path);
      case 'grep': return toolBroker.grep(args?.query || '', args?.path || '.');
      case 'bash': return toolBroker.bash(args?.cmd, args?.args || [], { cwd: wt.root });
      default: throw new Error('UNKNOWN_TOOL');
    }
  }

  // Budget enforcement pre-check
const provider = (process.env.LLM_PROVIDER || 'perplexity').toLowerCase();
const model = process.env.LLM_MODEL || (provider === 'anthropic' ? 'claude-3.5-sonnet' : 'pplx-7b-chat');
const projectId = projectRoot || 'default';
const prId = ticket || null;
const { estimateTokens } = await import('../../llm/util/estimate.mjs').catch(() => ({ estimateTokens: () => ({ inputTokens: 0, outputTokens: 0 }) }));
const fullMsgs = [{ role:'system', content: orch + '\n\n' + specs.map(s => `<!-- specialist:${s.slug} -->\n` + s.md).join('\n\n') }, { role:'user', content: prompt }];
const est = await estimateTokens({ messages: fullMsgs });
const { checkBudget, recordUsage } = await import('../../billing/enforce.mjs');
const { costUsd } = await import('../../billing/calc.mjs');
const budget = await checkBudget({ projectId, prId, provider, model, estimate: est });
if (!budget.allowed) {
  throw Object.assign(new Error('BUDGET_EXCEEDED'), { code:'BUDGET_EXCEEDED' });
}
const __callId = `composePR:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;

  const res = await runClaudeSession({
    system: orch + '\n\n' + specs.map(s => `<!-- specialist:${s.slug} -->\n` + s.md).join('\n\n'),
    messages: [{ role:'user', content: prompt }],
    tools: ['ls','read','grep','bash'],
    onToolCall,
    onStreamToken: (t) => onLog({ level:'trace', message:String(t) }),
  });

  // Record usage after successful run (outputTokens unknown here)
try {
  const dollars = await costUsd({ provider, model, inTok: est.inputTokens, outTok: 0 });
  await recordUsage({ callId: __callId, provider, model, inputTokens: est.inputTokens, outputTokens: 0, costUsd: dollars, projectId, prId });
} catch {}
const { changes = [], pr = {} } = res || {};

  for (const ch of changes) {
    await wt.applyFile(ch.path, ch.content);
  }

  const prBody = buildPrBody({ prompt, changes, testsSummary: pr.testsSummary });
  const prInfo = await openPullRequest({
    projectRoot,
    worktree: wt,
    ticket,
    title: pr.title || `AI PR: ${ticket || 'compose'}`,
    body: prBody,
  });

  onLog({ level:'info', message:'composePR done', meta:{ changed: changes.length, pr: prInfo.url } });
  return { ok:true, pr: prInfo, changedFiles: changes.map(c => c.path) };
}
