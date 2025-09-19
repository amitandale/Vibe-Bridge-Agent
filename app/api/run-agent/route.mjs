import path from 'node:path';
import fs from 'node:fs/promises';
import { parseUnifiedDiff, applyHunksToContent } from '../../../lib/diff.mjs';
import { selectRetriever } from '../../../lib/context/retrievers/select.mjs';
import { Codes, httpError } from '../../../lib/obs/errors.mjs';
import makeAutoGenClient from '../../../lib/vendors/autogen.client.mjs';
import { createRun, updateRun } from '../../../lib/ai/runs.mjs';

async function jsonResp(data, opts = {}) {
  try {
    const mod = await import('next/server');
    if (mod?.NextResponse?.json) return mod.NextResponse.json(data, opts);
  } catch {}
  const status = opts?.status ?? 200;
  const headers = { 'content-type': 'application/json' };
  try { return new Response(JSON.stringify(data), { status, headers }); }
  catch { return { status, async json(){ return data; } }; }
}

import { append as appendLog } from '../../../lib/logs/bus.mjs';
import { requireBridgeGuardsAsync, requireHmac } from '../../../lib/security/guard.mjs';

// test hooks
const testRetrieve = globalThis.__TEST_RETRIEVE__ || null;
const testAutogen = globalThis.__TEST_AUTOGEN__ || null;
const testExecutor = globalThis.__BA_EXECUTOR__ || null;

function sanitizeUnder(root, rel) {
  const p = path.normalize(rel).replace(/^([/\\])+/, '');
  const full = path.join(root, p);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(path.resolve(root))) throw new Error('path traversal');
  return resolved;
}

function toContextRefs(items = [], k = 5) {
  return items.slice(0, k).map(a => ({
    path: a.path || 'unknown',
    span: null,
    snippet: typeof a.text === 'string' ? a.text.slice(0, 300) : ''
  }));
}

async function applyPatches(projectRoot, patches = []) {
  let applied = 0;
  for (const p of patches) {
    const diffText = String(p?.diff || '');
    if (!diffText.trim()) throw new Error('empty diff');
    const entries = parseUnifiedDiff(diffText);
    if (!Array.isArray(entries) || entries.length === 0) throw new Error('invalid diff');
    for (const e of entries) {
      const targetPath = sanitizeUnder(projectRoot, e.newPath || e.oldPath || p.path || '');
      let original = '';
      try { original = await fs.readFile(targetPath, 'utf-8'); } catch { original = ''; }
      const nextText = applyHunksToContent(original, e.hunks || []);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, nextText, 'utf-8');
      applied += 1;
    }
  }
  return applied;
}

async function writeTests(projectRoot, tests = []) {
  let written = 0;
  for (const t of tests) {
    const rel = t?.path || '';
    const content = String(t?.content || '');
    const under = rel && !rel.startsWith('tests/generated/') ? path.join('tests/generated', rel) : rel;
    const full = sanitizeUnder(projectRoot, under);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
    written += 1;
  }
  return written;
}

async function enforceGuards(req, raw) {
  // Soft gate: only enforce if guard headers are present
  const hasSig = req.headers.get?.('x-signature') || req.headers.get?.('x-bridge-signature');
  const hasTic = req.headers.get?.('authorization') || req.headers.get?.('x-vibe-ticket') || req.headers.get?.('x-ticket');
  if (!hasSig && !hasTic) return { ok: true };

  const jwt = await requireBridgeGuardsAsync(req, { scope: [] });
  if (!jwt?.ok) return jwt;

  // HMAC middleware expects Express-like req/res/next; emulate with a stub
  const mw = requireHmac({ rawBodyReader: async () => raw });
  let allowed = false;
  let statusCode = 0;
  let body = '';
  const res = {
    setHeader(){},
    end(s){ body = String(s || ''); },
    get statusCode(){ return statusCode; },
    set statusCode(v){ statusCode = v; }
  };
  const fakeReq = { headers: req.headers };
  await mw(fakeReq, res, () => { allowed = true; });
  if (!allowed) {
    try {
      const parsed = body ? JSON.parse(body) : { error:{ code:'ERR_FORBIDDEN', message:'forbidden' } };
      return { ok:false, ...httpError(parsed?.error?.code || Codes.ERR_FORBIDDEN, parsed?.error?.message || 'forbidden', statusCode || 403) };
    } catch {
      return { ok:false, ...httpError(Codes.ERR_FORBIDDEN, 'forbidden', statusCode || 403) };
    }
  }
  return { ok: true };
}

export async function POST(req) {
  // Read raw body for HMAC, then parse JSON
  const raw = await req.text().catch(() => '');
  const body = raw ? (JSON.parse(raw || '{}')) : (await req.json().catch(() => ({})));

  const {
    projectRoot = process.cwd(),
    projectId = body?.projectId || process.env.PROJECT_ID || '',
    teamConfig = {},
    messages = [],
    topK = 5,
    idempotencyKey = body?.idempotencyKey || null
  } = body || {};

  // Create run and log start
  const runId = createRun({ projectRoot, prompt: String(messages?.[0]?.content || ''), roster: [], ticket: null });
  appendLog({ type:'llm', id: runId }, { level:'info', message:'run-agent start', meta:{ projectRoot, projectId } });

  // Guards
  try {
    const g = await enforceGuards(req, raw);
    if (!g?.ok) {
      appendLog({ type:'llm', id: runId }, { level:'warn', message:'guards rejected request', meta:{ status:g?.status, code:g?.body?.error?.code } });
      return jsonResp(g.body, { status: g.status || 401 });
    }
  } catch (e) {
    appendLog({ type:'llm', id: runId }, { level:'error', message:'guard error', meta:{ error:String(e?.message||e) } });
    const err = httpError(Codes.ERR_INTERNAL, 'guard error', 500);
    return jsonResp(err.body, { status: err.status });
  }

  // Resolve retriever
  let retrieve = testRetrieve;
  if (!retrieve) {
    const retr = selectRetriever({ env: process?.env || {} });
    retrieve = async (ctx, q) => await retr(ctx, q);
  }

  // Build contextRefs
  const artifacts = await retrieve({ env: process?.env || {}, projectId }, String(messages?.[0]?.content || ''));
  const contextRefs = toContextRefs(Array.isArray(artifacts) ? artifacts : [], topK);
  appendLog({ type:'llm', id: runId }, { level:'info', message:'context collected', meta:{ count: contextRefs.length } });

  // Prepare AutoGen client
  let autogen = testAutogen;
  if (!autogen) {
    autogen = makeAutoGenClient({
      baseUrl: process.env.AUTOGEN_URL || '',
      projectId: process.env.VENDOR_HMAC_PROJECT || process.env.PROJECT_ID || projectId || '',
      kid: process.env.VENDOR_HMAC_KID || '',
      key: process.env.VENDOR_HMAC_KEY || '',
      fetchImpl: globalThis.fetch
    });
  }

  // Call AutoGen
  let out;
  try {
    out = await autogen.runAgents({ teamConfig, messages, contextRefs, idempotencyKey });
    appendLog({ type:'llm', id: runId }, { level:'info', message:'autogen returned', meta:{ patches: out?.artifacts?.patches?.length||0, tests: out?.artifacts?.tests?.length||0 } });
  } catch (e) {
    updateRun(runId, { phase:'ERROR', step:1, errors: String(e?.message || e) });
    appendLog({ type:'llm', id: runId }, { level:'error', message:'autogen failed', meta:{ error:String(e) } });
    const err = httpError(Codes.ERR_INTERNAL, String(e?.message || 'autogen error'), 502);
    return jsonResp(err.body, { status: err.status });
  }

  // Apply artifacts
  let patchesApplied = 0, testsWritten = 0;
  try {
    patchesApplied = await applyPatches(projectRoot, out?.artifacts?.patches || []);
  } catch (e) {
    updateRun(runId, { phase:'ERROR', step:2, errors:'patch apply failed' });
    appendLog({ type:'llm', id: runId }, { level:'error', message:'patch apply failed', meta:{ error:String(e) } });
    const err = httpError(Codes.ERR_BAD_INPUT, 'patch apply failed', 400, { message: String(e?.message || e) });
    return jsonResp(err.body, { status: err.status });
  }
  try {
    testsWritten = await writeTests(projectRoot, out?.artifacts?.tests || []);
  } catch (e) {
    updateRun(runId, { phase:'ERROR', step:3, errors:'write tests failed' });
    appendLog({ type:'llm', id: runId }, { level:'error', message:'write tests failed', meta:{ error:String(e) } });
    const err = httpError(Codes.ERR_BAD_INPUT, 'write tests failed', 400, { message: String(e?.message || e) });
    return jsonResp(err.body, { status: err.status });
  }

  // Enqueue executor
const execMod = testExecutor || await import('../../../lib/exec/executor.mjs');
const execute = execMod.execute || execMod.default || (async () => ({ ok:true }));
// In tests, await the executor to avoid leaking async across test boundaries.
if (testExecutor || process.env.NODE_ENV === 'test') {
  try {
    await execute({ plan: { kind:'autogen', testsWritten, patchesApplied }, ctx: { projectRoot } });
    appendLog({ type:'llm', id: runId }, { level:'info', message:'executor completed (test)' });
  } catch (e) {
    appendLog({ type:'llm', id: runId }, { level:'error', message:'executor error (test)', meta:{ error:String(e) } });
  }
} else {
  // Detach in production. Use an unref’d handle so the event loop is not kept alive.
  const runDetached = () => {
    Promise.resolve()
      .then(() => execute({ plan: { kind:'autogen', testsWritten, patchesApplied }, ctx: { projectRoot } }))
      .then(() => appendLog({ type:'llm', id: runId }, { level:'info', message:'executor started' }))
      .catch((e) => appendLog({ type:'llm', id: runId }, { level:'error', message:'executor start error', meta:{ error:String(e) } }));
  };
  const h = (typeof setImmediate === 'function') ? setImmediate(runDetached) : setTimeout(runDetached, 0);
  if (h && typeof h.unref === 'function') h.unref();
}

return jsonResp({ ok:true, runId, applied: { patches: patchesApplied, tests: testsWritten }, summary });
}
