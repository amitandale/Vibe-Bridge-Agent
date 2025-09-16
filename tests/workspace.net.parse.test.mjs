// tests/workspace.net.parse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSsListeners, attachComposeProjects } from '../lib/workspace/net.host.mjs';

test('parseSsListeners parses ports and pids', () => {
  const sample = [
    'LISTEN 0      4096          0.0.0.0:8080       0.0.0.0:*     users:(("node",pid=1234,fd=23))',
    'LISTEN 0      4096             [::]:5432          [::]:*     users:(("postgres",pid=2345,fd=12))',
    ''
  ].join('\n');
  const rows = parseSsListeners(sample);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].port, 8080);
  assert.equal(rows[0].pid, 1234);
  const mapped = attachComposeProjects(rows, { '1234': 'webapp', 2345: 'db' });
  assert.equal(mapped[0].compose_project, 'webapp');
  assert.equal(mapped[1].compose_project, 'db');
});
