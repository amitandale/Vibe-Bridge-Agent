import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('assemble: shuffled input order yields identical hash', { timeout: 15000 }, async () => {
  const { assemble } = await import('../lib/ctxpack/assemble.mjs');

  const draft = {
    version: 'ctxpack.v1',
    project: 'demo',
    pr: 'x',
    mode: 'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 5000, max_files: 10, max_per_file_tokens: 500, section_caps: {} },
    must_include: [], nice_to_have: [], never_include: [],
    templates: [
      { id:'t2', section:'templates', path:'a.js', start_line:10, end_line:20, text:'B' },
      { id:'t1', section:'templates', path:'a.js', start_line:1, end_line:5, text:'A' },
    ],
    extras: [
      { id:'e1', section:'extras', path:'b.js', start_line:1, end_line:3, text:'X' }
    ],
    spec_canvas: [], diff_slices: [], linked_tests: [], contracts: []
  };

  const shuffled = JSON.parse(JSON.stringify(draft));
  shuffled.templates = [...draft.templates].reverse();

  const a = await assemble(draft, { model: 'default', merge_max_tokens: 0 });
  const b = await assemble(shuffled, { model: 'default', merge_max_tokens: 0 });

  assert.ok(a && b);
  assert.equal(a.hash, b.hash);
});
