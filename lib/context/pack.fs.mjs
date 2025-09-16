// Filesystem packer. Deterministic, budget-capped, redaction-aware.
import * as fsSync from 'node:fs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

function* walkSync(dir) {
  const entries = fsSync.readdirSync(dir, { withFileTypes: true });
  const dirs = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) dirs.push(full);
    else yield full;
  }
  for (const d of dirs.sort()) yield* walkSync(d); // deterministic order
}

function defaultBudget(b) {
  const maxChars = Math.max(1, b?.maxChars ?? 200_000);
  const maxFiles = Math.max(1, b?.maxFiles ?? 50);
  return { maxChars, maxFiles };
}

export async function pack({ repoRoot='.', query='', budget, redact } = {}) {
  const { maxChars, maxFiles } = defaultBudget(budget);
  const out = [];
  let used = 0;
  let files = 0;
  for (const fp of walkSync(repoRoot)) {
    if (files >= maxFiles) break;
    if (!fp.endsWith('.mjs') && !fp.endsWith('.js') && !fp.endsWith('.json') && !fp.endsWith('.md')) continue;
    const rel = fp.startsWith(repoRoot) ? fp.slice(repoRoot.length+1) : fp;
    const data = await fs.readFile(fp, 'utf8').catch(() => null);
    if (data == null) continue;
    if (query && !rel.toLowerCase().includes(query.toLowerCase())) continue; // simple heuristic
    let chunk = data;
    if (typeof redact === 'function') {
      chunk = await redact(chunk);
    }
    const remain = maxChars - used;
    if (remain <= 0) break;
    const slice = chunk.slice(0, Math.max(0, remain));
    out.push({ path: rel, content: slice });
    used += slice.length;
    files += 1;
  }
  return { artifacts: out, budget: { maxChars, maxFiles, usedChars: used, usedFiles: files } };
}

export default { pack };
