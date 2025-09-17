#!/usr/bin/env node
import { upsert } from '../../lib/repo/secrets.mjs';
const pid = process.env.BOOTSTRAP_PROJECT_ID;
const kid = process.env.BOOTSTRAP_HMAC_KID;
const key = process.env.BOOTSTRAP_HMAC_KEY;
if (!pid || !kid || !key) {
  console.error('BOOTSTRAP_PROJECT_ID, BOOTSTRAP_HMAC_KID, BOOTSTRAP_HMAC_KEY required');
  process.exit(2);
}
const now = Date.now();
await upsert({ kid, project_id: pid, type: 'HMAC', value: key, active: 1, created_at: now });
console.log('seeded', kid, 'for', pid);
