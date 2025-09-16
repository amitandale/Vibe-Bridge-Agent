// tests/runner.provision.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLabels, resolveLayout, renderSystemdUnit, serializeUnit, planProvision } from '../lib/runner/provision.mjs';

test('labels render', () => {
  assert.equal(renderLabels({ projectId:'p1', lane:'ci' }), 'vibe,p1,ci');
});

test('layout resolves deterministically', () => {
  const l = resolveLayout({ projectId:'p1', lane:'ci' });
  assert.equal(l.root, '/opt/github-runner/p1/ci');
  assert.equal(l.work.endsWith('/_work'), true);
  assert.ok(l.svcName.startsWith('github-runner@'));
});

test('systemd unit renders with registration pre-step', () => {
  const u = renderSystemdUnit({ projectId:'p1', lane:'ci', owner:'o', repo:'r', token:'ghr_123' });
  const text = serializeUnit(u);
  assert.match(text, /\[Unit\]/);
  assert.match(text, /\[Service\]/);
  assert.match(text, /ExecStartPre=.*config\.sh/);
  assert.match(text, /--labels vibe,p1,ci/);
  assert.match(text, /ExecStart=.*runsvc\.sh/);
});

test('planProvision returns file plan and layout', () => {
  const plan = planProvision({ projectId:'p1', lane:'ci', owner:'o', repo:'r', token:'ghr_abc' });
  assert.equal(plan.labels, 'vibe,p1,ci');
  assert.equal(plan.files.length, 1);
  assert.match(plan.files[0].path, /github-runner@p1-ci\.service$/);
  assert.match(plan.files[0].content, /WantedBy=multi-user.target/);
});
