import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function maybeImport(p) {
  try { return await import(p); } catch { return null; }
}

function pickIdempotencyKey(body) {
  return body?.idempotencyKey || body?.session || body?.plan || body?.commit || randomUUID();
}

async function buildContextRefs() {
  // Keep CI deterministic. Avoid heavy providers during tests.
  if (process.env.NODE_ENV === 'test' || process.env.VIBE_TEST === '1') return [];
  const mod = await maybeImport('../../../lib/context/pack.mjs');
  const K = Number(process.env.PLAN_PACK_TOP_K || 5);
  if (mod?.pack && typeof mod.pack === 'function') {
    try {
      const refs = await mod.pack({ provider: process.env.CONTEXT_PROVIDER });
      return Array.isArray(refs) ? refs.slice(0, K) : [];
    } catch { return []; }
  }
  return [];
}

async function applyPatchEntry(patch) {
  const filePath = path.resolve(process.cwd(), patch.path);
  const diff = String(patch.diff ?? '');
  // FULL sentinel used only in tests
  if (diff.startsWith('<<FULL>>')) {
    const content = diff.slice('<<FULL>>'.length);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
    return true;
  }
  const mod = await maybeImport('../../../lib/diff.mjs');
  if (mod?.applyUnifiedDiff) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const ok = await mod.applyUnifiedDiff(filePath, diff);
    if (!ok) throw Object.assign(new Error('hunk mismatch'), { code: 'BAD_REQUEST' });
    return true;
  }
  throw Object.assign(new Error('unsupported diff'), { code: 'BAD_REQUEST' });
}

async function applyArtifacts(artifacts) {
  let patchesApplied = 0;
  for (const p of artifacts.patches || []) {
    await applyPatchEntry(p);
    patchesApplied++;
  }
  let testsWritten = 0;
  for (const t of artifacts.tests || []) {
    const filePath = path.resolve(process.cwd(), t.path);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, t.content ?? '', 'utf8');
    testsWritten++;
  }
  return { patchesApplied, testsWritten };
}

export async function POST(req) {
  const guard = await maybeImport('../../../lib/security/guard.mjs');
  if (guard?.requireBridgeGuards) await guard.requireBridgeGuards(req);

  const body = await req.json();
  const idempotencyKey = pickIdempotencyKey(body);
  const contextRefs = await buildContextRefs();

  const mod = await maybeImport('../../../lib/vendors/autogen.client.mjs');
  const runAgents = mod?.runAgents || mod?.default?.runAgents;
  if (!runAgents) {
    return new Response(JSON.stringify({ ok: false, code: 'UPSTREAM_UNAVAILABLE' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }

  let result;
  try {
    result = await runAgents(
      { teamConfig: body.teamConfig, messages: body.messages, contextRefs, idempotencyKey },
      { fetchImpl: globalThis.fetch, baseUrl: (process.env.AUTOGEN_URL || 'http://local') }
    );
  } catch (e) {
    const code = e?.code || 'UPSTREAM_UNAVAILABLE';
    const __status = (e && typeof e.status === 'number' && e.status >= 400 && e.status < 500) || code === 'BAD_REQUEST' ? 400 : 502;
    return new Response(JSON.stringify({ ok: false, code }), { status: __status, headers: { 'content-type': 'application/json' } });
  }

  try {
    const { patchesApplied, testsWritten } = await applyArtifacts(result.artifacts || { patches: [], tests: [] });
    const payload = { plan: { type: 'run-tests' }, ctx: {} };
    if (globalThis.__onExecutorEnqueued) {
      try { globalThis.__onExecutorEnqueued(payload); } catch {}
    }
    const runId = randomUUID();
    const summary = 'patched and enqueued';
    return new Response(JSON.stringify({ ok: true, runId, summary, applied: { patches: patchesApplied, tests: testsWritten } }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    const code = e?.code || 'BAD_REQUEST';
    return new Response(JSON.stringify({ ok: false, code }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
}

export default { POST };
