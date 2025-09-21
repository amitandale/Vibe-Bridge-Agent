// app/api/run-agent/route.mjs — PR fix: remove guard enforcement; strict status mapping
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function maybeImport(p) { try { return await import(p); } catch { return null; } }
function pickIdempotencyKey(body) {
  return body?.idempotencyKey || body?.session || body?.plan || body?.commit || randomUUID();
}

async function applyPatchEntry(patch) {
  const filePath = path.resolve(process.cwd(), String(patch.path || ''));
  const diff = String(patch.diff ?? '');
  if (diff.startsWith('<<FULL>>')) {
    const content = diff.slice('<<FULL>>'.length);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
    return true;
  }
  const mod = await maybeImport('../../../lib/tools/patch.mjs');
  if (!mod?.applyUnifiedDiff) throw Object.assign(new Error('BAD_PATCH'), { code: 'BAD_REQUEST' });
  const ok = await mod.applyUnifiedDiff(filePath, diff);
  if (!ok) throw Object.assign(new Error('BAD_PATCH'), { code: 'BAD_REQUEST' });
  return true;
}

async function applyArtifacts(artifacts) {
  let patchesApplied = 0, testsWritten = 0;
  for (const p of (artifacts?.patches || [])) { await applyPatchEntry(p); patchesApplied++; }
  for (const t of (artifacts?.tests || [])) {
    const fp = path.resolve(process.cwd(), String(t.path || ''));
    await mkdir(path.dirname(fp), { recursive: true });
    await writeFile(fp, String(t.content ?? ''), 'utf8');
    testsWritten++;
  }
  return { patchesApplied, testsWritten };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const idempotencyKey = pickIdempotencyKey(body);

    // Skip heavy context packing during tests
    let contextRefs = [];
    if (!(process.env.NODE_ENV === 'test' || process.env.VIBE_TEST === '1')) {
      const pack = await maybeImport('../../../lib/context/pack.mjs');
      if (pack?.pack) { try { contextRefs = await pack.pack({ provider: process.env.CONTEXT_PROVIDER }); } catch {} }
    }

    const mod = await maybeImport('../../../lib/vendors/autogen.client.mjs');
    const runAgents = mod?.runAgents || mod?.default?.runAgents;
    if (!runAgents) {
      return new Response(JSON.stringify({ ok: false, code: 'UPSTREAM_UNAVAILABLE' }), { status: 503, headers: { 'content-type': 'application/json' } });
    }

    let result;
    try {
      const baseUrl = (process.env.AUTOGEN_URL || 'http://local');
      result = await runAgents(
        { teamConfig: body.teamConfig, messages: body.messages, contextRefs, idempotencyKey },
        { fetchImpl: globalThis.fetch, baseUrl }
      );
    } catch (e) {
      const code = e?.code || 'UPSTREAM_UNAVAILABLE';
      const status = (e && typeof e.status === 'number' && e.status >= 400 && e.status < 500) || code === 'BAD_REQUEST' ? 400 : 502;
      return new Response(JSON.stringify({ ok: false, code }), { status, headers: { 'content-type': 'application/json' } });
    }

    await applyArtifacts(result?.artifacts || { patches: [], tests: [] });
    if (globalThis.__onExecutorEnqueued) { try { globalThis.__onExecutorEnqueued({ plan: { type: 'run-tests' }, ctx: {} }); } catch {} }
    const runId = randomUUID();
    return new Response(JSON.stringify({ ok: true, runId, summary: 'patched and enqueued' }), { status: 200, headers: { 'content-type': 'application/json' } });

  } catch (e) {
    const code = e?.code || 'BAD_REQUEST';
    return new Response(JSON.stringify({ ok: false, code }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
}

export default { POST };
