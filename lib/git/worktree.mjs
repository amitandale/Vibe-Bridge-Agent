import { promises as fs } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

export async function createWorktree({ projectRoot }) {
  const root = resolve(projectRoot, '.ai-worktree');
  await fs.mkdir(root, { recursive: true });
  const changed = new Set();
  async function applyFile(rel, content) {
    const fp = join(root, rel);
    await fs.mkdir(dirname(fp), { recursive: true });
    await fs.writeFile(fp, content, 'utf8');
    changed.add(rel);
    return fp;
  }
  async function finalize({ conventionalMessage = 'chore(ai): apply generated changes' } = {}) {
    const files = [];
    for (const rel of changed) {
      const fp = join(root, rel);
      const content = await fs.readFile(fp, 'utf8');
      files.push({ path: rel, content });
    }
    return { files, commitMessage: conventionalMessage };
  }
  return { root, applyFile, finalize };
}
