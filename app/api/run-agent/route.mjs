import { requireBridgeGuards } from '../../../lib/security/guard.mjs';
import autogen from '../../../lib/vendors/autogen.client.mjs';
import { parseUnifiedDiff, applyHunksToContent } from '../../../lib/diff.mjs';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import crypto from 'node:crypto';

async function getRetriever() {
  if (globalThis.__selectRetriever) return globalThis.__selectRetriever;
  try {
    const mod = await import('../../../lib/context/retrievers/select.mjs');
    // Prefer explicit selector, but accept legacy 'select'
    return mod.selectRetriever || mod.select || (mod.default && (mod.default.selectRetriever || mod.default.select)) || null;
  } catch {
    return null;
  }
}

/**
 * POST /app/api/run-agent
 * Body: { teamConfig, messages, idempotencyKey?, projectRoot? }
 */
export async function POST(req) {
  // Guards
  const g = requireBridgeGuards(req);
  if (!g?.ok) {
    const status = g?.status || 401;
    const body = g?.body || { error: { code: 'UNAUTHORIZED' } };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  // Parse body
  let body = {};
  try { body = await req.json(); } catch {}
  const teamConfig = body?.teamConfig ?? {};
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const projectRoot = String(body?.projectRoot || process.cwd());
  const idempotencyKey = String(body?.idempotencyKey || req.headers.get('x-idempotency-key') || crypto.randomUUID());

  // Build contextRefs via retriever, fallback safe
  const topK = Number(process.env.PLAN_PACK_TOP_K || '5') || 5;
  let contextRefs = [];
  try {
    const retriever = await getRetriever();
    const query = { kind: 'run-agent', messages, teamConfig, topK };
    const ctx = { projectRoot };
    let nodes = [];
    if (typeof retriever === 'function') {
      nodes = await retriever(ctx, query);
    } else if (retriever && typeof retriever === 'object') {
      const fn = retriever.selectRetriever || retriever.select;
      if (typeof fn === 'function') {
        const r = await fn({ prefer: process.env.BA_RETRIEVER });
        if (typeof r === 'function') nodes = await r(ctx, query);
      }
    }
    const arr = Array.isArray(nodes) ? nodes : [];
    contextRefs = arr.slice(0, topK).map(n => {
      const p = String(n?.path || n?.id || '');
      const text = String(n?.text ?? n?.content ?? '');
      const snippet = text.slice(0, Math.min(text.length, 400));
      return { path: p, span: { start: 0, end: snippet.length }, snippet };
    });
  } catch {
    contextRefs = [];
  }

  // Call AutoGen vendor
  let result;
  try {
    result = await autogen.runAgents({ teamConfig, messages, contextRefs, idempotencyKey });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, code: 'UPSTREAM_UNAVAILABLE', message: String(e?.message || e) }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  // Apply artifacts
  let appliedPatches = 0;
  let createdTests = 0;
  try {
    const patches = Array.isArray(result?.artifacts?.patches) ? result.artifacts.patches : [];
    for (const p of patches) {
      const diffText = String(p?.diff || '');
      if (diffText.includes('diff --git')) {
        const files = parseUnifiedDiff(diffText);
        for (const f of files) {
          const targetRel = String(f.newPath || f.oldPath || '').trim();
          if (!targetRel) throw new Error('invalid diff entry');
          const abs = join(projectRoot, targetRel);
          let original = '';
          try { original = await fs.readFile(abs, 'utf8'); } catch { original = ''; }
          const next = applyHunksToContent(original, f.hunks || []);
          await fs.mkdir(dirname(abs), { recursive: true });
          await fs.writeFile(abs, next, 'utf8');
          appliedPatches++;
        }
      } else {
        const rel = String(p?.path || '').trim();
        if (!rel) throw new Error('missing path for non-diff patch');
        const abs = join(projectRoot, rel);
        await fs.mkdir(dirname(abs), { recursive: true });
        await fs.writeFile(abs, diffText, 'utf8');
        appliedPatches++;
      }
    }

    const tests = Array.isArray(result?.artifacts?.tests) ? result.artifacts.tests : [];
    for (const t of tests) {
      const rel = String(t?.path || '').replace(/^\/+/, '');
      const content = String(t?.content || '');
      const abs = join(projectRoot, 'tests', 'generated', rel);
      await fs.mkdir(dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, 'utf8');
      createdTests++;
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, code: 'BAD_REQUEST', message: String(e?.message || e) }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  // Enqueue executor asynchronously; test hook supported
  const payload = { plan: { type: 'run-tests' }, ctx: { projectRoot } };
  try {
    if (globalThis.__onExecutorEnqueued) {
      try { globalThis.__onExecutorEnqueued(payload); } catch {}
    }
    (async () => {
      try {
        const mod = await import('../../../lib/exec/executor.mjs');
        const execute = mod?.execute || mod?.default || null;
        if (typeof execute === 'function') {
          await execute(payload);
        }
      } catch {}
    })();
  } catch {}

  const summary = {
    transcript: Array.isArray(result?.transcript) ? result.transcript : [],
    applied: { patches: appliedPatches, tests: createdTests }
  };

  return new Response(JSON.stringify({ ok: true, runId: idempotencyKey, summary, applied: summary.applied }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
