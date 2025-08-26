// lib/providers/router.mjs
import * as vercel from './vercel.mjs';
import * as gcp from './gcp.mjs';

export function pick(provider){
  if (provider === 'vercel') return vercel;
  if (provider === 'gcp') return gcp;
  throw new Error('unsupported provider: ' + provider);
}

// Router-level aggregators so higher-level orchestrators can stay provider-agnostic.
export async function previewUrl({ provider, id, fetchImpl }){
  const a = pick(provider);
  const { url } = await a.previewUrl({ id, fetchImpl });
  return { url };
}

export async function deploy({ provider, repo, framework, fetchImpl }){
  const a = pick(provider);
  return a.deploy({ repo, framework, fetchImpl });
}

export async function status({ provider, id, fetchImpl }){
  const a = pick(provider);
  return a.status({ id, fetchImpl });
}
