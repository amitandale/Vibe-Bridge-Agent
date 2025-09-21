// lib/llm/config.mjs
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const CONFIG_PATH = process.env.VIBE_HOME
  ? join(process.env.VIBE_HOME, 'llm.config.json')
  : join(homedir(), '.vibe', 'llm.config.json');

async function ensureDir(){
  const dir = dirname(CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true });
  try { await fs.chmod(dir, 0o700); } catch {}
}

export async function getConfig(){
  try {
    const buf = await fs.readFile(CONFIG_PATH, 'utf-8');
    const json = JSON.parse(buf);
    return {
      provider: json.provider || process.env.LLM_PROVIDER || 'perplexity',
      model: json.model || process.env.LLM_MODEL || 'pplx-7b-chat',
      baseUrl: json.baseUrl || null
    };
  } catch {
    return {
      provider: process.env.LLM_PROVIDER || 'perplexity',
      model: process.env.LLM_MODEL || 'pplx-7b-chat',
      baseUrl: null
    };
  }
}

export async function setConfig(cfg){
  await ensureDir();
  const cur = await getConfig();
  const next = { ...cur, ...cfg };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2));
  try { await fs.chmod(CONFIG_PATH, 0o600); } catch {}
  return next;
}
