// lib/gh/prCiOrchestrator.mjs
// Runs a simple PR CI loop against GitHub and optionally fetches a preview URL via providers.

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function runPrCi({
  repo,
  branch,
  provider = 'vercel',
  framework = 'next',
  gh,                 // { openOrUpdatePr, prUrl, listChecks, previewId? }
  providers,          // router-like module having previewUrl({ id, fetchImpl })
  fetchImpl = globalThis.fetch,
  maxAttempts = 10,
  intervalMs = 100
}) {
  // 1) Ensure a PR exists
  const pr = await gh.openOrUpdatePr({ repo, branch });
  const prUrl = await gh.prUrl(pr.number);

  // 2) Poll checks
  let attempts = 0;
  while (attempts < maxAttempts) {
    const checks = await gh.listChecks();
    const completed = checks.every(c => c.status === 'completed');
    if (completed) {
      const failures = checks.filter(c => c.conclusion !== 'success')
                             .map(c => ({ name: c.name, conclusion: c.conclusion }));
      if (failures.length) {
        return { ok: false, prUrl, failures };
      }
      // success
      break;
    }
    attempts++;
    await sleep(intervalMs);
  }

  if (attempts >= maxAttempts) {
    return { ok: false, prUrl, failures: [{ name: 'timeout' }] };
  }

  // 3) Optional preview URL
  let previewUrl = null;
  try {
    const id = (await gh.previewId?.({ repo, number: pr.number })) || 'd1';
    if (providers && typeof providers.previewUrl === 'function') {
      const out = await providers.previewUrl({ provider, id, fetchImpl });
      previewUrl = out?.url ?? null;
    }
  } catch {
    // optional
  }

  return { ok: true, prUrl, previewUrl };
}
