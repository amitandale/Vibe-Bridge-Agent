import { promises as fs } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

export async function createWorktree({ projectRoot }) {
  const root = resolve(projectRoot, '.ai-worktree');
  await fs.mkdir(root, { recursive: true });
  async function applyFile(rel, content) {
    const fp = join(root, rel);
    await fs.mkdir(dirname(fp), { recursive: true });
    await fs.writeFile(fp, content, 'utf8');
    return fp;
  }
  return { root, applyFile };
}
