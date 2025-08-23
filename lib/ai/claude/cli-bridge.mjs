// Bridge to Claude Code CLI.
// Production: spawn CLI and route tool calls.
// Tests: use __setRunClaudeSessionForTests to stub behavior.

let __testImpl = null;

export function __setRunClaudeSessionForTests(fn) {
  __testImpl = fn;
}

export async function runClaudeSession({ system, messages, tools, onToolCall, onStreamToken }) {
  if (__testImpl) return __testImpl({ system, messages, tools, onToolCall, onStreamToken });
  // In production you will spawn the CLI process and connect its tool-calls to onToolCall.
  throw new Error('CLAUDE_CLI_NOT_WIRED');
}
