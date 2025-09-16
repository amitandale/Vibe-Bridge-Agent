import { dbAvailable } from '../lib/db/client.mjs';
// tests/repo.mappers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../lib/db/migrate.mjs';
import * as projects from '../lib/repo/projects.mjs';
import * as secrets from '../lib/repo/secrets.mjs';
import * as nonces from '../lib/repo/nonces.mjs';
import * as sessions from '../lib/repo/sessions.mjs';
import * as jobs from '../lib/repo/jobs.mjs';
import * as events from '../lib/repo/events.mjs';
import * as logs from '../lib/repo/logs.mjs';

test('CRUD basic mappers', () => {
  migrate({});
  projects.upsert({ id:'p1', name:'Proj 1' });
  const p = projects.get('p1');
  assert.equal(p.id, 'p1');
  projects.setDisabled('p1', 1);
  const p2 = projects.get('p1');
  assert.equal(p2.disabled, 1);

  secrets.add({ kid: 'k1', project_id:'p1', value:'s1' });
  const sk = secrets.getByKid('k1');
  assert.equal(sk.value, 's1');
  const list = secrets.listActiveForProject('p1');
  assert.equal(Array.isArray(list), true);
  assert.equal(list.length >= 1, true);

  const ok1 = nonces.insertIfAbsent('jti-1', { purpose:'ticket', ttl_s: 60 });
  assert.equal(ok1, true);
  const ok2 = nonces.insertIfAbsent('jti-1', { purpose:'ticket', ttl_s: 60 });
  assert.equal(ok2, false);

  sessions.create({ id:'s1', project_id:'p1', status:'running' });
  sessions.setStatus('s1', 'stopped');

  jobs.queue({ id:'j1', session_id:'s1', type:'build' });
  jobs.setState('j1', 'done');

  events.append({ id:'e1', project_id:'p1', payload_json:'{}' });
  logs.append({ project_id:'p1', message:'hello' });
});