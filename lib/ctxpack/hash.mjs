import { createHash } from 'node:crypto';
import { toCanonicalBytes } from './canonicalize.mjs';

export function sha256Canonical(obj) {
  const bytes = toCanonicalBytes(obj);
  const h = createHash('sha256').update(bytes).digest('hex');
  return h;
}
