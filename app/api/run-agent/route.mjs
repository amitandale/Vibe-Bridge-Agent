// app/api/run-agent/route.mjs
// Overlay S2-B: Wire run-agent route to AutoGen client, apply artifacts, enqueue executor.
import fs from 'node:fs/promises';
import path from 'node:path';

// Guard loader declared. Actual import happens inside POST to avoid module-load side effects.
let requireBridgeGuards = async (_req) => {};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Fallback simple unified-diff applier for trivial single-hunk patches
async function applyUnifiedPatchFallback(cwd, patchText) {
  // very small parser: expects --- a/<p>\n+++ b/<p>\n@@ ...\n-<old>\n+<new>\n
  const mPath = patchText.match(/^\s*---\s+a\/([^\n]+)\n\+\+\+\s+b\/\1/m);
  const mHunk = patchText.match(/^@@[^\n]*\n([\s\S]+)$/m);
  if (!mPath || !mHunk) return false;
  const fileRel = mPath[1];
  const body = mHunk[1];
  const minus = body.match(/^-([^\n\r]*)/m);
  const plus = body.match(/^\+([^\n\r]*)/m);
  const target = path.join(cwd, fileRel);
  let txt;
  try {
    txt = await fs.readFile(target, 'utf8');
  } catch {
    return false;
  }
  if (minus) {
    const oldLine = minus[1];
    if (!txt.includes(oldLine)) return false;
    const newLine = plus ? plus[1] : '';
    const updated = txt.replace(oldLine, newLine);
    await fs.writeFile(target, updated, 'utf8');
    return true;
  }
  return false;
}

async function applyPatches(cwd, patches) {
  if (!patches || !patches.length) return { applied: 0, failed: 0, failures: [] };
  let diffMod = null;
  try {
    diffMod = await import('../../../lib/diff.mjs');
  } catch {}
  const failures = [];
  let okCount = 0;
  for (const p of patches) {
    const patchText = p.diff || p.patch || '';
    let ok = false;
    try {
      if (diffMod) {
        // Try common APIs with graceful fallback
        if (typeof diffMod.applyUnifiedPatch === 'function') {
          ok = await diffMod.applyUnifiedPatch({ cwd, patch: patchText });
        } else if (typeof diffMod.apply === 'function') {
          ok = await diffMod.apply({ cwd, patch: patchText });
        } else if (typeof diffMod.default === 'function') {
          ok = await diffMod.default({ cwd, patch: patchText });
        }
      }
      if (!ok) {
        ok = await applyUnifiedPatchFallback(cwd, patchText);
      }
      if (ok) okCount++; else failures.push({ path: p.path || 'unknown', reason: 'hunk_mismatch' });
    } catch (e) {
      failures.push({ path: p.path || 'unknown', reason: e?.message || 'apply_error' });
    }
  }
  return { applied: okCount, failed: failures.length, failures };
}

async function writeTests(cwd, tests) {
  let count = 0;
  for (const t of tests || []) {
    const rel = t.path || `tests/generated/test-${Date.now()}.mjs`;
    const dest = path.join(cwd, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, t.content ?? '', 'utf8');
    count++;
  }
  return count;
}

function pickIdempotencyKey(body) {
  if (body?.idempotencyKey) return body.idempotencyKey;
  if (body?.session) return `session:${body.session}`;
  if (body?.plan) return `plan:${body.plan}`;
  if (body?.commit) return `commit:${body.commit}`;
  return `run:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

async function buildContextRefs(messages, K = 5) {
  // Try to use pack.mjs if present; otherwise return an empty list.
  try {
    const packMod = await import('../../../lib/context/pack.mjs');
    const pack = packMod.pack || packMod.default || null;
    if (typeof pack === 'function') {
      const out = await pack({ messages, topK: K });
      if (Array.isArray(out?.nodes)) {
        return out.nodes.slice(0, K).map(n => ({
          path: n.path || n.source || 'unknown',
          span: n.span || { start: 0, end: 0 },
          snippet: n.snippet || n.text || '',
        }));
      }
    }
  } catch {}
  return [];
}

export async function POST(req) {
  // Lazy-load guards to avoid side effects at module import time
  try {
    const g = await import('../../../lib/security/guard.mjs');
    requireBridgeGuards = g.requireBridgeGuards || g.default || requireBridgeGuards;
  } catch {}

  // Guards
  try {
    await requireBridgeGuards(req);
  } catch (e) {
    const code = e?.code || 'UNAUTHORIZED';
    const status = code === 'UNAUTHORIZED' ? 401 : 403;
    return jsonResponse(status, { ok: false, code, error: e?.message || 'guard_failed' });
  }

  // Parse input
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, code: 'BAD_REQUEST', error: 'invalid_json' });
  }
  const teamConfig = body?.teamConfig ?? {};
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const topK = Number(process.env.PLAN_PACK_TOP_K || 5) || 5;
  const idempotencyKey = pickIdempotencyKey(body);

  // Context
  const contextRefs = await buildContextRefs(messages, topK);

  // AutoGen call
  let autogen;
  try {
    autogen = await import('../../../lib/vendors/autogen.client.mjs').then(m => m.default || m);
  } catch {
    // If client missing, treat as upstream unavailable
    return jsonResponse(503, { ok: false, code: 'UPSTREAM_UNAVAILABLE', error: 'autogen_client_missing' });
  }

  let result;
  try {
    result = await autogen.runAgents({ teamConfig, messages, contextRefs, idempotencyKey });
  } catch (e) {
    const code = e?.code || 'UPSTREAM_UNAVAILABLE';
    const status = code === 'BAD_REQUEST' ? 400
                : code === 'UNAUTHORIZED' ? 401
                : code === 'FORBIDDEN' ? 403
                : code === 'NOT_FOUND' ? 404
                : 503;
    return jsonResponse(status, { ok: false, code, error: e?.message || 'autogen_error' });
  }

  // Apply artifacts
  const cwd = process.cwd();
  const patches = Array.isArray(result?.artifacts?.patches) ? result.artifacts.patches : [];
  const tests = Array.isArray(result?.artifacts?.tests) ? result.artifacts.tests : [];
  const patchStats = await applyPatches(cwd, patches);
  if (patchStats.failed > 0) {
    return jsonResponse(400, { ok: false, code: 'BAD_REQUEST', error: 'patch_failed', failures: patchStats.failures });
  }
  const testsCount = await writeTests(cwd, tests);

  // Enqueue executor
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = { plan: { type: 'run-tests' }, ctx: { runId } };
  try {
    const ex = await import('../../../lib/exec/executor.mjs').then(m => m.execute || m.default || null);
    if (typeof ex === 'function') {
      // run asynchronously
      queueMicrotask(() => { try { ex && ex(payload); } catch {} });
}
  } catch {}
  if (globalThis.__onExecutorEnqueued && typeof globalThis.__onExecutorEnqueued === 'function') {
    try { globalThis.__onExecutorEnqueued(payload); } catch {}
  }

  const summary = Array.isArray(result?.transcript) ? (result.transcript.slice(0, 3)) : [];
  return jsonResponse(200, {
    ok: true,
    runId,
    summary,
    applied: { patches: patchStats.applied, tests: testsCount }
  });
}
