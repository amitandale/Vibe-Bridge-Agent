import crypto from 'node:crypto';

export function sign(raw, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

export function verify(raw, sig, secret) {
  const expected = sign(raw, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig||''));
  } catch {
    return false;
  }
}
