import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import makeAutoGenClient from '../../lib/vendors/autogen.client.mjs';

test('autogen client signs, retries, and returns artifacts', async () => {
  const projectId = 'p1', kid = 'k1', key = 'sek';
  let calls = 0, captured = null;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    calls += 1;
    if (calls === 1) {
      return { ok:false, status:429, headers: new Map([['retry-after','0']]), text: async ()=>'rate' };
    }
    return {
      ok: true, status: 200,
      json: async () => ({
        transcript: [{ role:'system', content:'ok' }],
        artifacts: {
          patches: [{ path:'lib/a.mjs', diff:'--- a/lib/a.mjs\n+++ b/lib/a.mjs\n@@ -1,1 +1,1\n-old\n+new\n' }],
          tests: [{ path:'tests/generated/x.test.mjs', content:"import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('x',()=>assert.ok(true));\n" }]
        }
      })
    };
  };

  const client = makeAutoGenClient({ baseUrl:'', projectId, kid, key, fetchImpl: fakeFetch });
  const body = { teamConfig:{}, messages:[{ role:'user', content:'do X' }], contextRefs:[{ path:'a', snippet:'b' }], idempotencyKey:'idem-1' };
  const out = await client.runAgents(body);
  assert.equal(calls, 2);
  assert.ok(Array.isArray(out?.artifacts?.patches));
  assert.ok(Array.isArray(out?.artifacts?.tests));

  // signed headers
  const headers = captured.init.headers;
  const get = (k) => headers.get ? headers.get(k) : headers[k.toLowerCase()] || headers[k];
  assert.equal(get('x-vibe-project'), projectId);
  assert.equal(get('x-vibe-kid'), kid);
  const hex = createHmac('sha256', key).update(Buffer.from(captured.init.body)).digest('hex');
  assert.equal(get('x-signature'), `sha256=${hex}`);

  // body schema includes idempotency key header, but http client sets header not in body
  assert.equal(JSON.parse(captured.init.body).messages[0].role, 'user');
});
