// lib/providers/router.mjs
import * as vercel from './vercel.mjs';
import * as gcp from './gcp.mjs';
export function pick(provider){
  if (provider === 'vercel') return vercel;
  if (provider === 'gcp') return gcp;
  throw new Error('unsupported provider: ' + provider);
}
