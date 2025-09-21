// lib/gh/prCiOrchestrator.mjs
// Runs the PR CI loop on user infra. Webhook-driven by user-side n8n in practice.
// This module is pure; provide `gh` (GitHub client) and optional `providers` for preview URL.

const sleep = (ms) => new Promise(r => { setTimeout(r, ms); });

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
  if (!gh) throw new Error('gh client required');
  // 1) Open or update PR (idempotent)
  const { number } = await gh.openOrUpdatePr({ repo, branch });
  const prUrl = await gh.prUrl({ repo, number });

  // 2) Poll checks until success or failure
  let finalStatus = null;
  let failures = [];
  for (let i = 0; i < maxAttempts; i++){
    const checks = await gh.listChecks({ repo, ref: branch });
    const allCompleted = checks.every(c => c.status === 'completed');
    const anyFailed = checks.some(c => c.conclusion && c.conclusion !== 'success');
    if (allCompleted){
      finalStatus = anyFailed ? 'failed' : 'success';
      if (anyFailed){
        failures = checks
          .filter(c => c.conclusion && c.conclusion !== 'success')
          .map(c => ({ name: c.name, conclusion: c.conclusion, summary: c.summary || '' }));
      }
      break;
    }
    await sleep(intervalMs);
  }
  if (!finalStatus){
    return { ok:false, prUrl, failures: [{ name:'timeout', conclusion:'timed_out', summary:`No final status after ${maxAttempts} attempts` }] };
  }

  // 3) If success, optionally obtain preview URL via provider adapter
  if (finalStatus === 'success'){
    let previewUrl = null;
    if (providers && provider){
      const id = (await gh.previewId?.({ repo, number })) || null;
      if (id){
        try {
          const a = providers.pick(provider);
          const r = await a.previewUrl({ id, fetchImpl });
          previewUrl = r?.url || null;
        } catch(e){ /* swallow; preview optional */ }
      }
    }
    return { ok:true, prUrl, previewUrl };
  }

  return { ok:false, prUrl, failures };
}
