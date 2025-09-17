import fs from 'fs';
import path from 'path';
import { applyAll } from './db/migrate.mjs';
const DB_PATH = process.env.BRIDGE_DB_PATH || './data/bridge-agent.db';
export async function ensureStartup() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700, recursive: true });
  await applyAll();
}
