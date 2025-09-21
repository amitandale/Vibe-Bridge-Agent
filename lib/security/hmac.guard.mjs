// lib/security/hmac.guard.mjs
import crypto from 'node:crypto';

/** Return true if IP is localhost using x-forwarded-for chain when present. */
export function isLocalHost(req){
  try {
    const fwd = req.headers?.get?.('x-forwarded-for') || '';
    if (fwd) {
      const ips = fwd.split(',').map(s => s.trim()).filter(Boolean);
      if (ips.length === 0) return true;
      return ips.every(ip => ip === '127.0.0.1' || ip === '::1' || ip === 'localhost');
    }
  } catch {}
  // Best effort default for tests
  return true;
}

/** Verify HMAC-SHA256 of the raw body using VIBE_HMAC_SECRET. Signature hex in x-signature. */
export async function verifyHmac(req){
  const secret = process.env.VIBE_HMAC_SECRET || '';
  if (!secret) return false;
  const sig = req.headers?.get?.('x-signature') || '';
  if (!sig) return false;
  const method = (req.method || 'GET').toUpperCase();
  const text = method === 'GET' ? '' : await req.text();
  const mac = crypto.createHmac('sha256', secret).update(text).digest('hex');
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Guard utility. Returns { ok:false, status, body } on reject. Otherwise null. */
export async function guard(req){
  const expose = String(process.env.LLM_API_EXPOSE || 'false').toLowerCase() === 'true';
  if (!expose && !isLocalHost(req)) {
    return { ok:false, status:423, body:{ ok:false, code:'LOCALHOST_REQUIRED' } };
  }
  const kid = req.headers?.get?.('x-vibe-kid') || '';
  if (!kid) return { ok:false, status:401, body:{ ok:false, code:'HMAC_REQUIRED' } };
  const ok = await verifyHmac(req);
  if (!ok) return { ok:false, status:403, body:{ ok:false, code:'HMAC_INVALID' } };
  return null;
}
