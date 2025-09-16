import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(_execFile);

// test hook
let __execForTests = null;
export function __setExecForTests(fn) { __execForTests = fn; }
function getExec() { return __execForTests || execFile; }

function env(name, def = '') {
  const v = process.env[name];
  return (v === undefined || v === null) ? def : String(v);
}

function parseRoster(raw) {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map(x => String(x)).filter(Boolean);
  } catch { /* not json */ }
  return String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function readProjectConfig() {
  const token = env('CLAUDE_API_KEY', '');
  const bin = env('CLAUDE_CODE_BIN', 'claude');
  const roster = parseRoster(env('DEFAULT_ROSTER', ''));
  return {
    tokenPresent: !!token,
    cliPath: bin,
    roster
  };
}

export async function checkClaude() {
  const cfg = readProjectConfig();
  const result = {
    ok: false,
    claude: {
      tokenPresent: cfg.tokenPresent,
      cliFound: false,
      cliPath: cfg.cliPath,
      probe: { ok: false, detail: '' }
    },
    roster: cfg.roster
  };

  // Token presence is required for "ok", but we still check CLI regardless.
  const exec = getExec();
  try {
    const { stdout, stderr } = await exec(cfg.cliPath, ['--version'], { timeout: 5000 });
    result.claude.cliFound = true;
    const detail = String(stdout || stderr || '').trim();
    result.claude.probe = { ok: true, detail };
  } catch (e) {
    // ENOENT -> not found; anything else -> found but failed
    const msg = (e && (e.message || e.code)) ? String(e.message || e.code) : 'unknown';
    if (msg.includes('ENOENT')) {
      result.claude.cliFound = false;
      result.claude.probe = { ok: false, detail: 'CLI not found' };
    } else {
      result.claude.cliFound = true;
      result.claude.probe = { ok: false, detail: msg.slice(0, 200) };
    }
  }

  // Overall ok if token present and CLI found and probe ok
  result.ok = !!(result.claude.tokenPresent && result.claude.cliFound && result.claude.probe.ok);
  return result;
}
