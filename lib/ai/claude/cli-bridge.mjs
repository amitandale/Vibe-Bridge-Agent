import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Test stub injection
let __testImpl = null;
export function __setRunClaudeSessionForTests(fn) { __testImpl = fn; }

function env(name, fallback=null){ return process.env[name] ?? fallback; }

// Helper to run via a local HTTP proxy if configured (optional)
async function viaHttpProxy(payload){
  const url = env('CLAUDE_CODE_URL', null);
  if (!url) return null;
  const res = await fetch(url, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`CLAUDE_HTTP_${res.status}`);
  return await res.json();
}

export async function runClaudeSession({ system, messages, tools, onToolCall, onStreamToken, timeoutMs = 180_000 }) {
  if (__testImpl) return __testImpl({ system, messages, tools, onToolCall, onStreamToken });

  // Optional HTTP fallback
  const httpRes = await viaHttpProxy({ system, messages, tools }).catch(()=>null);
  if (httpRes) return httpRes;

  // CLI mode
  const bin = env('CLAUDE_CODE_BIN', 'claude');
  const args = ['code', 'agent']; // NOTE: placeholder; adjust to your local CLI command
  const proc = spawn(bin, args, { stdio: ['pipe','pipe','pipe'] });

  let stdoutBuf = '';
  let stderrBuf = '';
  let closed = false;

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    stdoutBuf += chunk;
    // Stream tokens (optional): emit raw
    if (onStreamToken) onStreamToken(String(chunk));
    // Detect tool call lines (JSONL protocol suggestion)
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj = null;
      try { obj = JSON.parse(trimmed); } catch {}
      if (obj && obj.type === 'tool_call') {
        Promise.resolve(onToolCall(obj.data))
          .then(result => { proc.stdin.write(JSON.stringify({ type:'tool_result', id: obj.id, result }) + '\n'); })
          .catch(err => { proc.stdin.write(JSON.stringify({ type:'tool_result', id: obj.id, error: String(err && err.message || err) }) + '\n'); });
      }
    }
  });

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk) => { stderrBuf += chunk; });

  // Send initial request (protocol placeholder)
  const req = { type:'start', system, messages, tools };
  proc.stdin.write(JSON.stringify(req) + '\n');

  // Await completion signal (protocol placeholder)
  const deadline = Date.now() + timeoutMs;
  while (!closed && Date.now() < deadline) {
    await delay(50);
    // In a real adapter, we'd parse a 'done' message with changes/pr
    // Here, if process exits, try to parse last full JSON object
    if (proc.exitCode !== null) break;
  }

  if (proc.exitCode === null) {
    try { proc.kill('SIGTERM'); } catch {}
    throw new Error('CLAUDE_TIMEOUT');
  }

  if (proc.exitCode !== 0) {
    const err = stderrBuf.trim() || 'UNKNOWN';
    throw new Error(`CLAUDE_CLI_FAILED: ${err}`);
  }

  // Attempt to parse a final JSON object from stdout (last non-tool line)
  const finalLines = stdoutBuf.split('\n').map(l => l.trim()).filter(Boolean);
  let lastObj = null;
  for (let i = finalLines.length - 1; i >= 0; i--) {
    try { lastObj = JSON.parse(finalLines[i]); break; } catch {}
  }
  if (!lastObj) throw new Error('CLAUDE_NO_RESULT');
  return lastObj;
}
