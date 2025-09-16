// tests/github.bootstrap.render.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWorkflow } from '../lib/github/bootstrap.mjs';

test('bootstrap: workflow render is deterministic and labeled', async () => {
  const a = await renderWorkflow({ projectId: 'proj1', lane: 'ci' });
  const b = await renderWorkflow({ projectId: 'proj1', lane: 'ci' });
  assert.equal(a, b);
  assert.match(a, /runs-on: \[self-hosted, vibe, proj1, ci\]/);
  assert.match(a, /actions\/checkout@v4/);
  assert.match(a, /actions\/setup-node@v4/);
});
