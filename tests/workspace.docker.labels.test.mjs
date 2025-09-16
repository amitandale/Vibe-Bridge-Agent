// tests/workspace.docker.labels.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseComposeProjectFromLabels, extractComposeProjects } from '../lib/workspace/docker.host.mjs';

test('docker compose project parsed from labels', () => {
  const line = 'maintainer=me,com.docker.compose.project=myproj,foo=bar';
  assert.equal(parseComposeProjectFromLabels(line), 'myproj');
  const many = extractComposeProjects([line, 'x=y,com.docker.compose.project=second']);
  assert.deepEqual(many.sort(), ['myproj','second']);
});
