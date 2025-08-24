import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { selfReview, changedFilesToTestPatterns } from '../lib/ai/orchestrator/selfreview.mjs';

async function write(p, s) {
  await fs.mkdir(join(p, '..'), { recursive: true }).catch(()=>{});
  await fs.writeFile(p, s, 'utf8');
}

test('changedFiles → test patterns heuristic', () => {
  const pats = changedFilesToTestPatterns(['lib/events/summary.mjs', 'lib/refs.mjs']);
  assert.ok(pats.find(x => x.includes('summary')));
  assert.ok(pats.find(x => x.includes('refs')));
});

test('self-review: trivial missing export gets auto-fixed and passes', async () => {
  const root = join(tmpdir(), `sr-${Date.now()}-1`);
  // module missing export
  await fs.mkdir(root, { recursive: true });
  await write(join(root, 'lib/events/summary.mjs'), `function summaryOf(){ return true }\n`);
  // test that expects named export summaryOf
  await write(join(root, 'tests/events.summary.shape.test.mjs'),
    `import { summaryOf } from '../lib/events/summary.mjs';\nimport test from 'node:test';\nimport assert from 'node:assert/strict';\n
     test('summary exists', () => { assert.equal(typeof summaryOf, 'function'); });\n`);

  const res = await selfReview({ projectRoot: root, changedFiles: ['lib/events/summary.mjs'], profile:'longrun' });
  assert.equal(res.ok, true);
  assert.equal(res.retried, true);
  assert.equal(res.fix.kind, 'missing-export');
});

test('self-review: non-trivial failure returns CHECKS_FAILED', async () => {
  const root = join(tmpdir(), `sr-${Date.now()}-2`);
  await fs.mkdir(root, { recursive: true });
  await write(join(root, 'lib/math/add.mjs'), `export function add(a,b){ return a+b }\n`);
  await write(join(root, 'tests/math.add.test.mjs'),
    `import { add } from '../lib/math/add.mjs';\nimport test from 'node:test';\nimport assert from 'node:assert/strict';\n
     test('broken', () => { assert.equal(add(1,1), 3); });\n`);
  const res = await selfReview({ projectRoot: root, changedFiles: ['lib/math/add.mjs'], profile:'longrun' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'CHECKS_FAILED');
});
