// lib/orchestrator.mjs
// Bridge-side implementation of provisioning orchestration.
// Heavy work happens here (provider calls, retries, etc.).
// For now we model the interface; providers are pluggable via lib/providers/router.mjs.
export const STEPS = [
  'VALIDATING_TOKENS',
  'PROVISIONING_APP',
  'DEPLOY_APP',
  'VERIFYING'
];

export function makeOrchestrator({ providers, events, now = () => Date.now() }) {
  // in-memory job table for tests; real runtime would use a store
  const jobs = new Map();

  function newJobId() {
    return 'job_' + Math.random().toString(36).slice(2, 10);
  }

  async function run({ project, profile = 'serverless' }) {
    const jobId = newJobId();
    const rec = { id: jobId, stepIndex: 0, project, profile, startedAt: now(), done: false, previewUrl: null };
    jobs.set(jobId, rec);
    events?.append?.(project?.id ?? 'unknown', { t: 'JOB_STARTED', jobId, at: rec.startedAt });
    return { ok: true, jobId, steps: STEPS, previewUrl: rec.previewUrl };
  }

  async function status({ jobId }) {
    const rec = jobs.get(jobId);
    if (!rec) return { ok: false, code: 'job_not_found' };
    return {
      ok: true,
      step: STEPS[rec.stepIndex],
      done: rec.done,
      previewUrl: rec.previewUrl
    };
  }

  async function advance({ jobId, step }) {
    const rec = jobs.get(jobId);
    if (!rec) return { ok: false, code: 'job_not_found' };
    // idempotent: if asked to advance past current, move forward once
    const expected = STEPS[rec.stepIndex];
    if (step && step !== expected) {
      // allow jump, but still only increment one
    }
    rec.stepIndex = Math.min(rec.stepIndex + 1, STEPS.length - 1);
    if (STEPS[rec.stepIndex] === 'DEPLOY_APP') {
      // mock a provider deploy in tests; real impl delegates to providers.router
      rec.previewUrl = 'https://preview.example.test/' + jobId;
    }
    if (STEPS[rec.stepIndex] === 'VERIFYING') {
      rec.done = true;
    }
    events?.append?.(rec.project?.id ?? 'unknown', { t: 'JOB_STEP', jobId, step: STEPS[rec.stepIndex], at: now() });
    return { ok: true };
  }

  return { run, status, advance, jobs };
}
