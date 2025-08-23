import { loadOrchestrator, loadSpecialists, loadDefaultRoster } from '../prompts/loader.mjs';
import { createToolBroker } from '../tools/broker.mjs';
import { runClaudeSession } from '../claude/cli-bridge.mjs';
import { createWorktree } from '../../git/worktree.mjs';
import { openPullRequest } from '../../git/gh.mjs';

export async function composePR({ projectRoot, prompt, roster, ticket, maxSteps = 30, onLog = () => {} }) {
  const toolBroker = createToolBroker({ root: projectRoot });
  const orch = await loadOrchestrator();
  const chosen = roster && roster.length ? roster : await loadDefaultRoster();
  const specs = await loadSpecialists(chosen);

  // Create isolated worktree for changes
  const wt = await createWorktree({ projectRoot });
  onLog({ level:'info', message:`Worktree created at ${wt.root}` });

  // Wire tool calls from the model to our broker
  async function onToolCall(call) {
    const { name, args } = call || {};
    switch (name) {
      case 'ls':   return toolBroker.ls(args?.path || '.');
      case 'read': return toolBroker.read(args?.path);
      case 'grep': return toolBroker.grep(args?.query || '', args?.path || '.');
      case 'bash': return toolBroker.bash(args?.cmd, args?.args || [], { cwd: wt.root });
      default: throw new Error('UNKNOWN_TOOL');
    }
  }

  // NOTE: The real implementation will spawn the Claude CLI and stream outputs.
  // For now, we keep the contract and let tests mock runClaudeSession.
  const res = await runClaudeSession({
    system: orch,
    messages: [{ role:'user', content: prompt }],
    tools: ['ls','read','grep','bash'],
    onToolCall,
    onStreamToken: (t) => onLog({ level:'debug', message:t }),
  });

  // Expect the model to return a patch summary we can apply (skeleton for now)
  const { changes = [], pr = {} } = res || {};
  // Apply changes in worktree
  for (const ch of changes) {
    await wt.applyFile(ch.path, ch.content);
  }

  const prInfo = await openPullRequest({
    projectRoot,
    worktree: wt,
    ticket,
    title: pr.title || `AI PR: ${ticket || 'compose'}`,
    body: pr.body || 'Automated PR by Claude Code runner.',
  });

  return { ok:true, pr: prInfo, changedFiles: changes.map(c => c.path) };
}
