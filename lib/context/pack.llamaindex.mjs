// LlamaIndex-backed packer. Builds a transient index from repo files and retrieves relevant chunks.
import * as fsSync from 'node:fs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { env } from '../util/env.mjs';

async function safeImportLlamaIndex() {
  try {
    const m = await import('llamaindex');
    return m;
  } catch (e) {
    const msg = [
      'LlamaIndex not installed.',
      'Set CONTEXT_PROVIDER=llamaindex and run scripts/install.sh to install runtime deps.'
    ].join(' ');
    throw new Error(msg);
  }
}

function* walkSync(dir) {
  const entries = fsSync.readdirSync(dir, { withFileTypes: true });
  const dirs = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) dirs.push(full);
    else yield full;
  }
  for (const d of dirs.sort()) yield* walkSync(d); // deterministic
}

function defaultBudget(b) {
  const maxChars = Math.max(1, b?.maxChars ?? 200_000);
  const maxFiles = Math.max(1, b?.maxFiles ?? 50);
  return { maxChars, maxFiles };
}

export async function pack({ repoRoot='.', query='', budget, redact, retriever } = {}) {
  const { maxChars, maxFiles } = defaultBudget(budget);
  const { VectorStoreIndex, Document } = await safeImportLlamaIndex();

  // Gather documents deterministically with a cap
  const docs = [];
  let files = 0;
  for (const fp of walkSync(repoRoot)) {
    if (files >= maxFiles) break;
    if (!fp.endsWith('.mjs') && !fp.endsWith('.js') && !fp.endsWith('.json') && !fp.endsWith('.md')) continue;
    const data = await fs.readFile(fp, 'utf8').catch(() => null);
    if (data == null) continue;
    const rel = fp.startsWith(repoRoot) ? fp.slice(repoRoot.length+1) : fp;
    docs.push(new Document({ text: data, id_: rel, metadata: { path: rel } }));
    files += 1;
  }

  // Build in-memory index
  const index = await VectorStoreIndex.fromDocuments(docs);
  const retr = index.asRetriever();

  // Query
  const q = String(query || '').trim() || 'project overview';
  const results = await retr.retrieve(q);

  // Redact and budget-cap
  const out = [];
  let used = 0;
  for (const node of results) {
    const path = node?.metadata?.path || node?.text?.slice(0,40) || 'snippet';
    let text = String(node?.text ?? '');
    if (typeof redact === 'function') text = await redact(text);
    const remain = maxChars - used;
    if (remain <= 0) break;
    const slice = text.slice(0, Math.max(0, remain));
    out.push({ path, content: slice });
    used += slice.length;
  }

  // Optional: augment with Cody retriever if configured and query looks code-centric
  const codeProvider = env('CONTEXT_CODE_PROVIDER', 'none').toLowerCase();
  if (codeProvider === 'cody' && retriever && typeof retriever.retrieve === 'function') {
    const extras = await retriever.retrieve({ query: q, limitChars: Math.max(0, maxChars - used) }).catch(() => null);
    if (extras && Array.isArray(extras.artifacts)) {
      for (const a of extras.artifacts) {
        if (used >= maxChars) break;
        const remain = maxChars - used;
        const slice = String(a.content || '').slice(0, remain);
        out.push({ path: a.path || 'cody', content: slice });
        used += slice.length;
      }
    }
  }

  return { artifacts: out, budget: { maxChars, maxFiles, usedChars: used, usedFiles: files } };
}

export default { pack };
