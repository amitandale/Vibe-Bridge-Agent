// tests/projects.validate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOwner, validateRepo, setRepoBinding, get } from '../lib/repo/projects.mjs';
import { migrate } from '../lib/db/migrate.mjs';

test('owner/repo validation', () => {
  assert.equal(validateOwner('openai'), true);
  assert.equal(validateOwner('A-b-1'), true);
  assert.equal(validateOwner('-bad'), false);
  assert.equal(validateOwner('bad-'), false);
  assert.equal(validateOwner(''), false);
  assert.equal(validateRepo('repo'), true);
  assert.equal(validateRepo('my.repo_1'), true);
  assert.equal(validateRepo('bad repo'), false);
  assert.equal(validateRepo(''), false);
});

test('setRepoBinding writes to DB', () => {
  migrate({});
  setRepoBinding('p1', { owner:'o1', repo:'r1' });
  const row = get('p1');
  assert.equal(row.repo_owner, 'o1');
  assert.equal(row.repo_name,  'r1');
});
