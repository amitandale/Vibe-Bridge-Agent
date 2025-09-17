// Minimal client shims for tests that import dataDir.
// BA-02 does not require full DB, but tests reference the constant.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

export const dataDir = resolve(process.cwd(), './data');
export function ensureDataDir() {
  try { mkdirSync(dataDir, { recursive: true, mode: 0o700 }); } catch {}
  return dataDir;
}
