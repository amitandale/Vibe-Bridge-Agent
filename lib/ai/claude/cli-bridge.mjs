// Skeleton bridge to Claude Code CLI. For tests, mock this module.
export async function runClaudeSession({ system, messages, tools, onToolCall, onStreamToken }) {
  // In production: spawn Claude Code CLI / local server and route tool calls to onToolCall.
  // For now: throw if accidentally called in tests.
  throw new Error('CLAUDE_CLI_NOT_WIRED');
}
