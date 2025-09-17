// lib/security/_diag.mjs
export function d(msg, meta={}){
  if (process.env.VIBE_DIAG_SECURITY === '1') {
    try { console.error('# SEC', msg, meta) } catch {}
  }
}
