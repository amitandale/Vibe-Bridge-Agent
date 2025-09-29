import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCompat } from '../../lib/preflight/compat.mjs';

test('schema gate rejects unknown schema', { timeout: 15000 }, () => {
  const endpoints = { services: { s1: { schema_version: 'mcp.v2', version: '1.2.3' } } };
  assert.throws(() => verifyCompat({ endpoints, matrix: { minVersions: { s1: '1.0.0' } } }), /SCHEMA_INCOMPATIBLE/);
});

test('min version enforced', { timeout: 15000 }, () => {
  const endpoints = { services: { s1: { schema_version: 'mcp.v1', version: '0.9.9' } } };
  try {
    verifyCompat({ endpoints, matrix: { minVersions: { s1: '1.0.0' } } });
    assert.fail('should have thrown');
  } catch (e){
    assert.equal(e.code, 'SCHEMA_INCOMPATIBLE');
    assert.equal(e.details.service, 's1');
    assert.equal(e.details.need, '1.0.0');
  }
});

test('valid passes', { timeout: 15000 }, () => {
  const endpoints = { services: { s1: { schema_version: 'mcp.v1', version: '1.2.3' } } };
  const r = verifyCompat({ endpoints, matrix: { minVersions: { s1: '1.0.0' } } });
  assert.equal(r.ok, true);
});
