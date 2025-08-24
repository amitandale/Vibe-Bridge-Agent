import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as createPlan } from '../app/api/plan/create/route.mjs';
import { GET as listPlan } from '../app/api/plan/list/route.mjs';

test('plan create + list shape', async () => {
  const projectId = 'proj-123';
  const req1 = new Request('http://local/api/plan/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      title: 'Add auth',
      prompt: 'Add login page and JWT guard',
      scope: { files: ['app/login.tsx','lib/auth.mjs'] },
      tests: { files: ['tests/auth.login.test.mjs'] },
      acceptance: ['User can log in', 'Protect /app routes'],
    })
  });
  const res1 = await createPlan(req1);
  assert.equal(res1.status, 200);
  const j1 = await res1.json();
  assert.ok(j1.id);

  const req2 = new Request(`http://local/api/plan/list?projectId=${projectId}`, { method: 'GET' });
  const res2 = await listPlan(req2);
  assert.equal(res2.status, 200);
  const j2 = await res2.json();
  assert.ok(Array.isArray(j2.items));
  assert.ok(j2.items.find(x => x.id === j1.id));
});
