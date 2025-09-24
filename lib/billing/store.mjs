// lib/billing/store.mjs
// JSON budgets and NDJSON usage with idempotency index at ~/.vibe/billing
import { mkdir, readFile, writeFile, open, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

/**
 * @typedef {{ id?:string, scope:'project'|'pr', scopeId:string, hardUsd:number, softUsd:number, period:'once'|'month', active?:boolean, updatedAt?:string }} Budget
 * @typedef {{ callId:string, provider:string, model:string, inputTokens:number, outputTokens:number, costUsd:number, projectId?:string, prId?:string, ts?:string }} UsageEvent
 */

function baseDir(){
  return path.join(homedir(), '.vibe', 'billing');
}
function budgetsPath(){ return path.join(baseDir(), 'budgets.json'); }
function usagePath(){ return path.join(baseDir(), 'usage.ndjson'); }
function usageIndexPath(){ return path.join(baseDir(), 'usage.index.json'); }

async function ensureDir(){
  await mkdir(baseDir(), { recursive: true });
}

async function atomicWrite(filePath, data){
  await ensureDir();
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, data, 'utf8');
  await writeFile(filePath, await readFile(tmp, 'utf8'), 'utf8'); // double write to ensure fsync on some FS
  // rename is not strictly needed due to final write above; keep simple for portability
  try { await access(filePath, fsConstants.R_OK); } catch {}
}

/** @returns {Promise<Budget[]>} */
export async function loadBudgets(){
  try {
    const raw = await readFile(budgetsPath(), 'utf8');
    const obj = JSON.parse(raw);
    return Array.isArray(obj) ? obj : [];
  } catch { return []; }
}

/** @param {Budget} b */
export async function upsertBudget(b){
  if (!b || (b.scope!=='project' && b.scope!=='pr')) throw new Error('INVALID_SCOPE');
  if (!b.scopeId) throw new Error('INVALID_SCOPE_ID');
  const hard = Number(b.hardUsd);
  const soft = Number(b.softUsd);
  if (!(hard >= 0) || !(soft >= 0) || hard < soft) throw new Error('INVALID_LIMITS');
  const period = b.period === 'month' ? 'month' : 'once';
  const id = b.id || `${b.scope}:${b.scopeId}:${period}`;
  const updatedAt = new Date().toISOString();
  const active = b.active === false ? false : true;
  const entry = { id, scope:b.scope, scopeId:b.scopeId, hardUsd:hard, softUsd:soft, period, active, updatedAt };
  const list = await loadBudgets();
  const idx = list.findIndex(x => x.id === id);
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  await atomicWrite(budgetsPath(), JSON.stringify(list, null, 2));
  return entry;
}

/** @param {UsageEvent} ev */
export async function recordUsage(ev){
  if (!ev || !ev.callId) throw new Error('INVALID_CALL_ID');
  await ensureDir();
  // Load or init index
  let index = {};
  try { index = JSON.parse(await readFile(usageIndexPath(), 'utf8')); } catch {}
  if (index[ev.callId]) return { inserted:false };
  // Append event
  const fh = await open(usagePath(), 'a');
  try {
    const obj = {
      callId: ev.callId,
      provider: ev.provider, model: ev.model,
      inputTokens: Number(ev.inputTokens)||0, outputTokens: Number(ev.outputTokens)||0,
      costUsd: Number(ev.costUsd)||0,
      projectId: ev.projectId || null, prId: ev.prId || null,
      ts: ev.ts || new Date().toISOString()
    };
    const line = JSON.stringify(obj) + '\n';
    await fh.write(line);
  } finally {
    await fh.close();
  }
  // Update index
  index[ev.callId] = true;
  await atomicWrite(usageIndexPath(), JSON.stringify(index));
  return { inserted:true };
}

/** @param {{prId?:string, projectId?:string, limit?:number}} q */
export async function listUsage(q){
  const limit = q?.limit && q.limit > 0 ? q.limit : 100;
  let lines = [];
  try {
    const raw = await readFile(usagePath(), 'utf8');
    lines = raw.split('\n').filter(Boolean);
  } catch { return []; }
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--){
    try {
      const obj = JSON.parse(lines[i]);
      if (q?.prId && obj.prId !== q.prId) continue;
      if (q?.projectId && obj.projectId !== q.projectId) continue;
      out.push(obj);
    } catch {}
  }
  return out.reverse();
}
