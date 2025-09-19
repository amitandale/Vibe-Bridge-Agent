import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parseUnifiedDiff, applyHunksToContent } from '../../../lib/diff.mjs';
import { selectRetriever } from '../../../lib/context/retrievers/select.mjs';
import { Codes, httpError } from '../../../lib/obs/errors.mjs';
import makeAutoGenClient from '../../../lib/vendors/autogen.client.mjs';

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

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const {
    projectRoot = process.cwd(),
    projectId = body?.projectId || process.env.PROJECT_ID || '',
    teamConfig = {},
    messages = [],
    topK = 5,
    idempotencyKey = body?.idempotencyKey || null
  } = body || {};

  // Resolve retriever
  let retrieve = testRetrieve;
  if (!retrieve) {
    const retr = selectRetriever({ env: process?.env || {} });
    retrieve = async (ctx, q) => await retr(ctx, q);
  }

  // Build contextRefs
  const artifacts = await retrieve({ env: process?.env || {}, projectId }, String(messages?.[0]?.content || ''));
  const contextRefs = toContextRefs(Array.isArray(artifacts) ? artifacts : [], topK);

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
  } catch (e) {
    const err = httpError(Codes.ERR_INTERNAL, String(e?.message || 'autogen error'), 502);
    return NextResponse.json(err.body, { status: err.status });
  }

  // Apply artifacts
  let patchesApplied = 0, testsWritten = 0;
  try {
    patchesApplied = await applyPatches(projectRoot, out?.artifacts?.patches || []);
  } catch (e) {
    const err = httpError(Codes.ERR_BAD_INPUT, 'patch apply failed', 400, { message: String(e?.message || e) });
    return NextResponse.json(err.body, { status: err.status });
  }
  try {
    testsWritten = await writeTests(projectRoot, out?.artifacts?.tests || []);
  } catch (e) {
    const err = httpError(Codes.ERR_BAD_INPUT, 'write tests failed', 400, { message: String(e?.message || e) });
    return NextResponse.json(err.body, { status: err.status });
  }

  // Enqueue executor
  const execMod = testExecutor || await import('../../../lib/exec/executor.mjs');
  const execute = execMod.execute || execMod.default || (() => ({ ok:true }));
  // fire and forget
  execute({ plan: { kind:'autogen', testsWritten, patchesApplied }, ctx: { projectRoot } }).catch(()=>{});

  const summary = Array.isArray(out?.transcript) ? (out.transcript.slice(-1)[0]?.content || '') : '';
  return NextResponse.json({ ok:true, runId: null, applied: { patches: patchesApplied, tests: testsWritten }, summary });
}
