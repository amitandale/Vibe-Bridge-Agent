// scripts/hmac/seed.mjs
import { setHmacKey, setActiveHmacKid } from '../../lib/repo/secrets.mjs';

export async function main(env = process.env){
  const projectId = env.BOOTSTRAP_PROJECT_ID;
  const kid = env.BOOTSTRAP_HMAC_KID;
  const key = env.BOOTSTRAP_HMAC_KEY;
  if (!projectId || !kid || !key){
    console.error('Missing BOOTSTRAP_* env vars');
    process.exitCode = 1;
    return { ok:false, code:'MISSING_ENV' };
  }
  await setHmacKey({ projectId, kid, key });
  await setActiveHmacKid({ projectId, kid });
  return { ok:true, projectId, kid };
}

if (import.meta.url === `file://${process.argv[1]}`){
  main().then(r => { if (r?.ok) console.log(JSON.stringify(r)); });
}
