// Context packer entry. Provider switch with safe defaults.
import { env } from '../util/env.mjs';

function getProvider() {
  return env('CONTEXT_PROVIDER', 'fs').toLowerCase();
}

// Public API: pack({ repoRoot, query, budget, redact, retriever })
// - repoRoot: string path
// - query: string | null
// - budget: { maxChars?: number, maxFiles?: number }
// - redact: async (text) => string
// - retriever: optional adapter used by providers to fetch code snippets (e.g., Cody)
export async function pack(opts = {}) {
  const provider = getProvider();
  if (provider === 'llamaindex') {
    const mod = await import('./pack.llamaindex.mjs');
    return mod.pack(opts);
  }
  const mod = await import('./pack.fs.mjs');
  return mod.pack(opts);
}

export default { pack };
