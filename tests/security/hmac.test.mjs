import tap from 'tap';
import { sign, ctEqual } from '../../bridge-agent/lib/security/hmac.mjs';
import { upsert, clear } from '../../bridge-agent/lib/repo/secrets.mjs';
import { verify } from '../../bridge-agent/lib/security/hmac.mjs';

tap.before(async ()=> await clear());

tap.test('hmac verify correct and mismatch', async t=>{
  const pid = 'p1';
  const kid = 'k1';
  const key = 'secret-abc';
  await upsert({ kid, project_id: pid, type: 'HMAC', value: key, active: 1, created_at: Date.now() });
  const raw = Buffer.from('hello');
  const hex = await sign({ keyValue: key, rawBody: raw });
  t.match(hex, /^[0-9a-f]{64}$/);
  const ok = await verify({ projectId: pid, kid, signatureHex: 'sha256='+hex, rawBody: raw });
  t.same(ok.ok, true);
  const bad = await verify({ projectId: pid, kid, signatureHex: 'sha256=00'+hex.slice(2), rawBody: raw });
  t.same(bad.ok, false);
  t.end();
});

tap.test('ctEqual works', t=>{
  t.equal(ctEqual('aabb', 'aabb'), true);
  t.equal(ctEqual('aabb', 'ccdd'), false);
  t.end();
});
