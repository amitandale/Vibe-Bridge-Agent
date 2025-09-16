// tests/runner.health.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDelay, shouldRetry, classifyService } from '../lib/runner/health.mjs';

test('nextDelay exponential and capped', () => {
  assert.equal(nextDelay(0), 5);
  assert.equal(nextDelay(1), 10);
  assert.equal(nextDelay(2), 20);
  assert.equal(nextDelay(5), 160);
  assert.equal(nextDelay(10), 300);
  assert.equal(nextDelay(20), 300);
});

test('shouldRetry gates attempts', () => {
  const now = 1000;
  // failures=2 -> wait 20s
  assert.equal(shouldRetry({ lastAttemptEpochS: 981, failures: 2, nowEpochS: now }), false);
  assert.equal(shouldRetry({ lastAttemptEpochS: 980, failures: 2, nowEpochS: now }), true);
});

test('classifyService works', () => {
  const now = 2000;
  assert.equal(classifyService({ state: 'active', lastSeenEpochS: 1990, nowEpochS: now }), 'healthy');
  assert.equal(classifyService({ state: 'active', lastSeenEpochS: 1800, nowEpochS: now, staleAfterS: 100 }), 'stale');
  assert.equal(classifyService({ state: 'failed', lastSeenEpochS: 1999, nowEpochS: now }), 'unhealthy');
  assert.equal(classifyService({ state: 'inactive', lastSeenEpochS: 1999, nowEpochS: now }), 'stopped');
});
