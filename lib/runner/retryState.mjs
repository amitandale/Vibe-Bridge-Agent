// lib/runner/retryState.mjs
// Persist retry state to data/runner-retry.json; allow injection for tests
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(process.cwd(), 'data/runner-retry.json');

async function readJson(file){
  try { const s = await fs.readFile(file, 'utf-8'); return JSON.parse(s||'{}'); }
  catch { return {}; }
}

export async function get(name){
  const db = await readJson(FILE);
  return db[name] || { lastAttemptEpochS: 0, failures: 0 };
}

export async function set(name, rec){
  const db = await readJson(FILE);
  db[name] = rec;
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db, null, 2));
}
