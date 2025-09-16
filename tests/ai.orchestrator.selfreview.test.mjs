import test from 'node:test';
import assert from 'node:assert/strict';
import { changedFilesToTestPatterns } from '../lib/ai/orchestrator/selfreview.mjs';

test('changedFiles → test patterns heuristic', () => {
  const pats = changedFilesToTestPatterns(['lib/events/summary.mjs', 'lib/refs.mjs']);
  assert.ok(pats.find(x => x.includes('summary')));
  assert.ok(pats.find(x => x.includes('refs')));
});
