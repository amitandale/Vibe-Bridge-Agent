import { spawn } from 'node:child_process';

function runProc(cmd, args, { cwd, timeoutMs=60000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env, stdio: ['ignore','pipe','pipe'] });
    let out = '', err = '';
    let killed = false;
    const to = setTimeout(() => { killed = true; try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
    child.stdout.on('data', d => out += String(d));
    child.stderr.on('data', d => err += String(d));
    child.on('close', (code) => {
      clearTimeout(to);
      resolve({ code, stdout: out, stderr: err, timedOut: killed });
    });
  });
}

export async function runNodeTestPattern({ projectRoot, pattern, timeoutMs=60000 }) {
  // Allowlist: node --test "<pattern>"
  const args = ['--test', String(pattern)];
  return await runProc('node', args, { cwd: projectRoot, timeoutMs });
}

export async function runNpmTestPattern({ projectRoot, pattern, timeoutMs=60000 }) {
  // Allowlist: npm test -- "<pattern>"
  const args = ['test', '--', String(pattern)];
  return await runProc('npm', args, { cwd: projectRoot, timeoutMs });
}
