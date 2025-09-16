import { loadOrchestrator, loadSpecialists, loadDefaultRoster } from '../prompts/loader.mjs';
import { createToolBroker } from '../tools/broker.mjs';
import { runClaudeSession } from '../claude/cli-bridge.mjs';
import { createWorktree } from '../../git/worktree.mjs';
import { openPullRequest } from '../../git/gh.mjs';

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

  const res = await runClaudeSession({
    system: orch + '\n\n' + specs.map(s => `<!-- specialist:${s.slug} -->\n` + s.md).join('\n\n'),
    messages: [{ role:'user', content: prompt }],
    tools: ['ls','read','grep','bash'],
    onToolCall,
    onStreamToken: (t) => onLog({ level:'trace', message:String(t) }),
  });

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
