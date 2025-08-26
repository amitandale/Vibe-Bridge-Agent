// lib/gh/prCiOrchestrator.mjs
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * runPrCi
 * - Ensures a PR exists for {repo, branch}
 * - Polls GitHub checks until all are completed
 * - On failures: returns { ok:false, prUrl, failures:[{ name, conclusion }] }
 * - On timeout: returns { ok:false, prUrl, failures:[{ name:'timeout' }] }
 * - On success: fetches preview URL from providers and returns { ok:true, prUrl, previewUrl }
 */
export async function runPrCi({
  repo,
  branch,
  provider = 'vercel',
  gh,                 // { openOrUpdatePr, prUrl, listChecks, previewId? }
  providers,          // router-like module exporting previewUrl({ provider, id, fetchImpl })
  fetchImpl = globalThis.fetch,
  maxAttempts = 10,
  intervalMs = 100
}) {
  // 1) Ensure PR exists and capture URL
  const pr = await gh.openOrUpdatePr({ repo, branch });
  const number = pr?.number;
  const prUrl = await gh.prUrl(number);

  // 2) Poll checks until completed
  let attempts = 0;
  while (attempts < maxAttempts) {
    const checks = await gh.listChecks();
    const completed = Array.isArray(checks) && checks.every(c => c.status === 'completed');
    if (completed) {
      const failures = checks
        .filter(c => c.conclusion !== 'success')
        .map(c => ({ name: c.name, conclusion: c.conclusion }));
      if (failures.length) return { ok: false, prUrl, failures };
      break; // all success
    }
    attempts++;
    await sleep(intervalMs);
  }

  if (attempts >= maxAttempts) {
    return { ok: false, prUrl, failures: [{ name: 'timeout' }] };
  }

  // 3) Success path: fetch preview URL if provider available
  let previewUrl = null;
  try {
    const id = (await gh.previewId?.({ repo, number })) || 'd1';
    if (providers && typeof providers.previewUrl === 'function') {
      const out = await providers.previewUrl({ provider, id, fetchImpl });
      previewUrl = out?.url ?? null;
    }
  } catch {
    // preview is optional; swallow errors
  }

  return { ok: true, prUrl, previewUrl };
}
