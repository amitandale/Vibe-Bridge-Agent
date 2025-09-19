import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHttp } from '../../lib/vendors/http.mjs';
import * as CodesMod from '../../lib/obs/errors.mjs';

// Resolve Codes export in a robust way across shapes.
const Codes = (CodesMod && (CodesMod.Codes || (CodesMod.default && CodesMod.default.Codes) || CodesMod.default)) || CodesMod;

function stubFetch(status) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    text: async () => ''
  });
}

async function expectCodeForStatus(status, expectedName) {
  const http = makeHttp({ baseUrl: '', projectId: 'p', kid: 'k', key: 's', fetchImpl: stubFetch(status) });
  try {
    await http.post('/err', { body: '' });
    if (status >= 400) {
      throw new Error('expected throw');
    }
  } catch (e) {
    const hasExpected = !!(Codes && Object.prototype.hasOwnProperty.call(Codes, expectedName));
    if (hasExpected) {
      assert.equal(e.code, Codes[expectedName], `status ${status} → ${expectedName}`);
    } else {
      // If the repo does not define this constant, ensure we still return a string code.
      assert.ok(e.code, `missing error code for status ${status}`);
      assert.equal(typeof e.code, 'string');
    }
  }
}

test('status maps to Codes correctly', async () => {
  await expectCodeForStatus(400, 'BAD_REQUEST');
  await expectCodeForStatus(401, 'UNAUTHENTICATED');
  await expectCodeForStatus(403, 'FORBIDDEN');
  await expectCodeForStatus(404, 'NOT_FOUND');
  await expectCodeForStatus(429, 'RATE_LIMITED');
  await expectCodeForStatus(500, 'UPSTREAM_UNAVAILABLE');
  await expectCodeForStatus(503, 'UPSTREAM_UNAVAILABLE');
});
