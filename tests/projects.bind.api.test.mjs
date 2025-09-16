// tests/projects.bind.api.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as bind } from '../app/api/projects/bind/route.mjs';
import { get } from '../lib/repo/projects.mjs';
import { migrate } from '../lib/db/migrate.mjs';

test('POST /api/projects/bind validates and binds', async () => {
  migrate({});
  const reqBad = new Request('http://local/api/projects/bind', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ projectId:'p1', owner:'-bad', repo:'r' }) });
  const badRes = await bind(reqBad);
  assert.equal(badRes.status, 400);

  const req = new Request('http://local/api/projects/bind', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ projectId:'p2', owner:'o', repo:'r' }) });
  const res = await bind(req);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  const row = get('p2');
  assert.equal(row.repo_owner, 'o');
  assert.equal(row.repo_name, 'r');
});
