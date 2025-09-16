/**
 * lib/security/nonceCache.mjs
 * Insert-if-absent nonce cache. DB-backed if available, else in-memory.
 */
import { dbAvailable } from '../db/client.mjs';

let repoModule = null; // lazy import

async function ensureRepo(){
  if (!repoModule){
    // Dynamic import to avoid ESM cycle and to evaluate only when DB-backed
    repoModule = await import('../repo/nonces.mjs');
  }
  return repoModule;
}

export class NonceCache {
  constructor({ ttlDefaultS = 3600 } = {}){
    this.ttlDefaultS = ttlDefaultS;
    this.map = new Map();
  }

  sweep(now = Date.now()){
    for (const [k, exp] of this.map.entries()){
      if (exp <= now) this.map.delete(k);
    }
  }

  /**
   * Returns true if inserted, false if already seen (replay).
   */
  async insertIfAbsent(id, { purpose = "ticket", ttlS = this.ttlDefaultS } = {}) {
    const dbBacked = !!process.env.DATABASE_URL && dbAvailable();
    if (dbBacked){
      try {
        const repo = await ensureRepo();
        return repo.insertIfAbsent(id, { purpose, ttl_s: ttlS });
      } catch {
        // fall back to in-memory on any DB error
      }
    }
    const now = Date.now();
    const exp = now + (ttlS * 1000);
    if (this.map.has(id)) return false;
    this.map.set(id, exp);
    return true;
  }
}
