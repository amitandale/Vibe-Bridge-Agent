// scripts/hmac/seed.mjs
import { _seed } from '../../lib/security/hmac.mjs';

const projectId = process.env.BOOTSTRAP_PROJECT_ID;
const kid = process.env.BOOTSTRAP_HMAC_KID;
const key = process.env.BOOTSTRAP_HMAC_KEY;

if (!projectId || !kid || !key){
  console.error('missing BOOTSTRAP_PROJECT_ID or BOOTSTRAP_HMAC_KID or BOOTSTRAP_HMAC_KEY');
  process.exit(2);
}

_seed({ projectId, kid, key });
console.log('seeded hmac key for', projectId, 'kid', kid);
