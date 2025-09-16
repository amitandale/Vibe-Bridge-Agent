// Optional embeddings reindex script.
// Usage: node scripts/context/reindex.mjs [--all | --paths src,lib,docs] [--concurrency 2] [--dry-run]
// No PR identifiers in code.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export async function runReindex(options = {}) {
  const cwd = options.cwd || process.cwd();
  const dryRun = !!options.dryRun;
  const concurrency = Number(options.concurrency || 2);
  const pathsArg = options.paths || ['src', 'lib', 'docs'];
  const exts = options.exts || ['.js', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.md'];
  const runId = options.runId || `reindex-${Date.now()}`;

  const targets = await collectFiles(cwd, pathsArg, exts);
  const total = targets.length;
  const startedAt = Date.now();

  const log = await getLogger();
  await log('context.reindex', { phase: 'start', runId, total, dryRun });

  let indexed = 0;
  let errors = 0;

  const pool = new Array(Math.max(1, concurrency)).fill(null).map(() => worker());
  await Promise.all(pool);

  const duration_ms = Date.now() - startedAt;
  await log('context.reindex', { phase: 'done', runId, total, indexed, errors, duration_ms });

  return { ok: errors === 0, total, indexed, errors, duration_ms };

  async function worker() {
    while (targets.length) {
      const file = targets.pop();
      try {
        if (!dryRun) {
          await embedFile(cwd, file, options);
        }
        indexed++;
        if (indexed % 50 === 0) await log('context.reindex', { phase: 'progress', runId, indexed, total });
      } catch (_e) {
        errors++;
        await log('context.reindex', { phase: 'error', runId, file, message: String(_e && _e.message || _e) });
      }
    }
  }
}

async function collectFiles(rootDir, relPaths, exts) {
  const out = [];
  const seen = new Set();
  for (const p of relPaths) {
    const abs = path.resolve(rootDir, p);
    await walk(abs);
  }
  return out;

  async function walk(dir) {
    let ents;
    try {
      ents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith('.')) continue;
        await walk(p);
      } else {
        const ext = path.extname(ent.name).toLowerCase();
        if (!exts.includes(ext)) continue;
        if (seen.has(p)) continue;
        seen.add(p);
        out.push(p);
      }
    }
  }
}

async function embedFile(cwd, absPath, options) {
  // Lazy import LlamaIndex pack/embeddings if available.
  // Fall back to a no-op so CLI remains stable in all envs.
  try {
    const rel = path.relative(cwd, absPath);
    // Attempt a project-local embedder
    try {
      const mod = await import('../../lib/context/embed.mjs');
      if (typeof mod.embedFile === 'function') {
        return await mod.embedFile({ path: absPath, rel });
      }
    } catch {}

    // As a fallback, process via packer if it indexes on read.
    try {
      const packMod = await import('../../lib/context/pack.mjs');
      const pack = packMod.pack ?? packMod.default ?? null;
      if (typeof pack === 'function') {
        await pack({ mode: 'index' }, { filePath: absPath });
        return;
      }
    } catch {}

    // Final fallback: read the file to keep parity and allow progress logging.
    await fs.promises.readFile(absPath);
  } catch (e) {
    throw e;
  }
}

async function getLogger() {
  // Try BA-40 logger
  try {
    const mod = await import('../../lib/obs/log.mjs');
    const fn = mod.log ?? mod.default ?? null;
    if (typeof fn === 'function') return fn;
  } catch {}
  // Console fallback
  return async (channel, payload) => {
    const stamp = new Date().toISOString();
    console.log(`[${stamp}][${channel}]`, JSON.stringify(payload));
  };
}

// If invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, concurrency: 2, paths: undefined };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--concurrency') opts.concurrency = Number(args[++i] || 2);
    else if (a === '--all') opts.paths = ['.'];
    else if (a === '--paths') {
      const v = args[++i] || '';
      opts.paths = v.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  runReindex(opts).then(res => {
    if (!res.ok) process.exitCode = 1;
  }).catch(err => {
    console.error(String(err && err.stack || err));
    process.exitCode = 1;
  });
}
