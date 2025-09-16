// lib/routes/prci.api.mjs
import { runPrCi } from '../gh/prCiOrchestrator.mjs';
import * as providersRouter from '../providers/router.mjs';

export async function postPrCi({ body, gh, fetchImpl }){
  const { repo, branch, provider, framework } = body || {};
  const result = await runPrCi({
    repo, branch, provider, framework,
    gh, providers: providersRouter, fetchImpl,
  });
  return result;
}
