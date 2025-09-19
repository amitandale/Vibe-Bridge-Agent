// lib/gh/prCiOrchestrator.mjs
// Runs the PR CI loop on user infra. Webhook-driven by user-side n8n in practice.
// This module is pure; provide `gh` (GitHub client) and optional `providers` for preview URL.

const sleep = (ms) => new Promise(r => { const t = setTimeout(r, ms); t.unref?.(); });

/**
 * Polls GitHub checks for a PR and returns success, failures, or timeout.
 * No intervals are left running after resolution.
 */
export async function runPrCi({
  repo,          // "owner/name"
  branch,        // "feature/foo"
  provider,      // "vercel" | "gcp" (optional for preview)
  framework,     // framework hint (optional)
  gh,            // injected GitHub client with: openOrUpdatePr, listChecks, prUrl, previewId?
  providers,     // optional { pick(provider).previewUrl({ id, fetchImpl }) }
  fetchImpl = globalThis.fetch,
  maxAttempts = 30,
  intervalMs = 2000,
}){
  if (!gh || typeof gh.openOrUpdatePr !== 'function' || typeof gh.listChecks !== 'function' || typeof gh.prUrl !== 'function'){
    throw new Error('invalid gh client');
  }

  const { number } = await gh.openOrUpdatePr({ repo, branch, provider, framework });
  const prUrl = await gh.prUrl({ repo, number });

  // Poll checks
  for (let attempt = 1; attempt <= maxAttempts; attempt++){
    const checks = await gh.listChecks({ repo, number }) || [];
    const completed = checks.filter(c => c?.status === 'completed');
    const pending = checks.filter(c => c?.status !== 'completed');

    // Any non-success completed is a failure
    const failed = completed.filter(c => (c?.conclusion || '').toLowerCase() !== 'success');

    if (failed.length){
      const failures = failed.map(c => ({
        name: c?.name || 'unknown',
        conclusion: (c?.conclusion || 'failure').toLowerCase(),
        summary: c?.summary || c?.output?.title || null
      }));

      return { ok:false, prUrl, failures };
    }

    // All checks completed and no pending -> success
    if (completed.length && pending.length === 0){
      let previewUrl = null;
      if (providers && provider){
        const id = (await gh.previewId?.({ repo, number })) || null;
        if (id){
          try {
            const a = providers.pick(provider);
            const r = await a.previewUrl({ id, fetchImpl });
            previewUrl = r?.url || null;
          } catch { /* optional */ }
        }
      }
      return { ok:true, prUrl, previewUrl };
    }

    // Not done yet; sleep before next check
    if (attempt < maxAttempts){
      await sleep(intervalMs);
    }
  }

  // Timed out
  return { ok:false, prUrl, failures: [{ name:'timeout', conclusion:'timed_out' }] };
}
