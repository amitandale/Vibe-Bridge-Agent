// lib/compose/hooks.mjs
import { ensureCapacityBeforeCompose } from '../workspace/capacity.wire.mjs';

/** Call before rendering or starting docker compose services for a lane. */
export async function beforeComposeUp({ desiredPorts=[] } = {}, { exec, env } = {}){
  const cap = await ensureCapacityBeforeCompose({ desiredPorts }, { exec, env });
  if (!cap?.ok){
    const e = new Error('CAPACITY_BLOCK');
    e.code = cap?.code || 'E_CAPACITY';
    throw e;
  }
  return cap;
}
