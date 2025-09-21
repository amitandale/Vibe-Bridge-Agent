import { requireBridgeGuards } from '../../../lib/security/guard.mjs';
import autogen from '../../../lib/vendors/autogen.client.mjs';
import { pack } from '../../../lib/context/pack.mjs';
import { parseUnifiedDiff, applyHunksToContent } from '../../../lib/diff.mjs';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import crypto from 'node:crypto';

/**
 * POST /app/api/run-agent
 * Body: { teamConfig, messages, idempotencyKey?, projectRoot? }
 * Headers required for guards: x-signature, x-vibe-ticket (presence-only legacy)
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
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const teamConfig = body?.teamConfig ?? {};
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const projectRoot = String(body?.projectRoot || process.cwd());
  const idempotencyKey = String(body?.idempotencyKey || req.headers.get('x-idempotency-key') || crypto.randomUUID());

  // Build contextRefs via packer
  const topK = Number(process.env.PLAN_PACK_TOP_K || '5') || 5;
  let contextRefs = [];
  try {
    const res = await pack({ repoRoot: projectRoot, budget: { maxChars: 200_000, maxFiles: 50 } });
    const arts = Array.isArray(res?.artifacts) ? res.artifacts : Array.isArray(res) ? res : [];
    contextRefs = arts.slice(0, topK).map(a => {
      const text = String(a?.content ?? a?.text ?? '');
      const snippet = text.slice(0, Math.min(text.length, 400));
      return { path: String(a?.path || ''), span: { start: 0, end: snippet.length }, snippet };
    });
  } catch {
    contextRefs = [];
  }

  // Call AutoGen vendor
  let result;
  try {
    result = await autogen.runAgents({ teamConfig, messages, contextRefs, idempotencyKey });
  } catch (e) {
    // Map upstream unavailability to 503
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
      // Prefer unified diff path
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
        // Fallback: treat as full-file content replacement when path is provided
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
    // Fire-and-forget
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
