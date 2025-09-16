import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

const mem = {
  itemsByProject: new Map(), // projectId -> Array<PlanItem>
};

function nowIso() {
  return new Date().toISOString();
}

function genId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `plan_${t}_${r}`;
}

function getArrForProject(projectId) {
  if (!mem.itemsByProject.has(projectId)) mem.itemsByProject.set(projectId, []);
  return mem.itemsByProject.get(projectId);
}

export async function createPlanItem({ projectId, title, prompt, scope, tests, acceptance, status='PLANNED' }) {
  if (!projectId) throw new Error('MISSING_PROJECT_ID');
  if (!prompt && !title) throw new Error('MISSING_PROMPT_OR_TITLE');
  const id = genId();
  const item = {
    id, projectId,
    title: title || (prompt ? String(prompt).slice(0, 60) : 'Plan Item'),
    prompt: prompt || '',
    scope: scope || null,
    tests: tests || null,
    acceptance: acceptance || null,
    status,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const arr = getArrForProject(projectId);
  arr.push(item);
  await persist();
  return item;
}

export async function listPlanItems({ projectId }) {
  if (!projectId) throw new Error('MISSING_PROJECT_ID');
  const arr = getArrForProject(projectId);
  // return newest first
  return [...arr].sort((a,b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function updatePlanItemStatus({ projectId, id, status }) {
  const arr = getArrForProject(projectId);
  const it = arr.find(x => x.id === id);
  if (!it) return null;
  it.status = status;
  it.updatedAt = nowIso();
  await persist();
  return it;
}

// Optional persistence if PLAN_STORE_FILE is set (for long-run profile)
const FILE = process.env.PLAN_STORE_FILE || '';

async function persist() {
  if (!FILE) return;
  const byProj = {};
  for (const [k,v] of mem.itemsByProject.entries()) {
    byProj[k] = v;
  }
  const data = JSON.stringify({ itemsByProject: byProj }, null, 2);
  await fs.mkdir(dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, data, 'utf8');
}

export async function loadPersisted() {
  if (!FILE) return;
  try {
    const txt = await fs.readFile(FILE, 'utf8');
    const j = JSON.parse(txt);
    mem.itemsByProject = new Map(Object.entries(j.itemsByProject || {}));
  } catch (_) {
    // ignore
  }
}
