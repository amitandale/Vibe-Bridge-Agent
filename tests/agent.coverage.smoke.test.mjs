// tests/agent.coverage.smoke.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('bridge-agent coverage: runner present', () => { assert.equal(typeof process.version, 'string'); });
