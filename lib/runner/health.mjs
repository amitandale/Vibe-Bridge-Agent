// lib/runner/health.mjs
// Backoff and health evaluation for runner services

/** Exponential backoff in seconds given prior failures count n>=0. Base 5s, cap 300s. */
export function nextDelay(failures){
  const n = Math.max(0, Number(failures||0));
  const d = Math.floor(5 * Math.pow(2, n));
  return Math.min(300, d);
}

/** Decide if a retry is allowed now. */
export function shouldRetry({ lastAttemptEpochS=0, failures=0, nowEpochS }){
  const wait = nextDelay(failures);
  return (nowEpochS - lastAttemptEpochS) >= wait;
}

/** Simple service health classification. */
export function classifyService({ state, lastSeenEpochS=0, nowEpochS, staleAfterS=120 }){
  // state: 'active'|'failed'|'inactive'
  if (state === 'failed') return 'unhealthy';
  if (state === 'inactive') return 'stopped';
  const stale = (nowEpochS - lastSeenEpochS) > staleAfterS;
  if (stale) return 'stale';
  return 'healthy';
}
