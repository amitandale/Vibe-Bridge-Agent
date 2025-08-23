import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PACK_BASE = 'agents/claude/pack';

export async function loadOrchestrator() {
  const fp = join(process.cwd(), PACK_BASE, 'orchestrators', 'tech-lead-orchestrator.md');
  try {
    return await readFile(fp, 'utf8');
  } catch (e) {
    const hint = `Missing Claude prompt pack at ${fp}. Run vendor_claude_pack.sh to vendor the files.`;
    throw new Error(hint);
  }
}

export async function loadSpecialists(roster = []) {
  const base = join(process.cwd(), PACK_BASE, 'specialists');
  const out = [];
  for (const slug of roster) {
    const fp = join(base, `${slug}.md`);
    try {
      const md = await readFile(fp, 'utf8');
      out.push({ slug, md });
    } catch (e) {
      // Skip missing specialist with a clear hint
      out.push({ slug, md: `<!-- missing specialist: ${slug}; ensure ${fp} exists -->` });
    }
  }
  return out;
}

export async function loadDefaultRoster() {
  try {
    const fp = join(process.cwd(), PACK_BASE, 'roster.defaults.json');
    const json = await readFile(fp, 'utf8');
    return JSON.parse(json);
  } catch {
    return ['react','nextjs','node','test-writer']; // safe defaults; not guaranteed to exist
  }
}
