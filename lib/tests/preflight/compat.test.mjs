// tests/preflight/compat.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyCompat } from '../../lib/preflight/compat.mjs';

test('schema gate rejects unknown schema', { timeout: 15000 }, () => {
  const endpoints = { services: [{ name: 'svc', schema_version: 'mcp.v2', version: '1.0.0' }] };
  assert.throws(
    () => verifyCompat({ endpoints, matrix: {} }),
    /SCHEMA_INCOMPATIBLE/
  );
});

test('min version enforced', { timeout: 15000 }, () => {
  const endpoints = { services: [{ name: 'svc', schema_version: 'mcp.v1', version: '1.2.2' }] };
  assert.throws(
    () => verifyCompat({ endpoints, matrix: { svc: { min: '1.2.3' } } }),
    /SCHEMA_INCOMPATIBLE/
  );
});

test('valid passes', { timeout: 15000 }, () => {
  const endpoints = { services: [{ name: 'svc', schema_version: 'mcp.v1', version: '1.2.3' }] };
  assert.doesNotThrow(() => verifyCompat({ endpoints, matrix: { svc: { min: '1.2.3' } } }));
});
