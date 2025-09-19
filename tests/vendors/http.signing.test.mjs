import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { makeHttp } from '../../lib/vendors/http.mjs';

test('http signing sets required headers with correct HMAC', async () => {
  let captured = null;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({ ok: true })
    };
  };

  const projectId = 'proj_123';
  const kid = 'kid_abc';
  const key = 'secret_key_value';
  const body = { hello: 'world' };
  const bodyStr = JSON.stringify(body);
  const expectedHex = createHmac('sha256', key).update(Buffer.from(bodyStr)).digest('hex');

  const http = makeHttp({ baseUrl: '', projectId, kid, key, fetchImpl: fakeFetch });
  const res = await http.post('/foo', { body });
  assert.equal(res.ok, true);
  assert.ok(captured);
  const headers = captured.init.headers;
  const get = (k) => headers.get ? headers.get(k) : headers[k.toLowerCase()] || headers[k];
  assert.equal(get('x-vibe-project'), projectId);
  assert.equal(get('x-vibe-kid'), kid);
  assert.equal(get('x-signature'), `sha256=${expectedHex}`);
  assert.equal(get('content-type'), 'application/json');
});
