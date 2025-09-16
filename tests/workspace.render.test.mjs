// tests/workspace.render.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderWorkspace, resolveTemplate } from '../lib/workspace/render.mjs';

test('resolveTemplate fails closed when not found', async () => {
  await assert.rejects(() => resolveTemplate({ templateFile: '/does/not/exist.yml' }), /TEMPLATE_NOT_FOUND/);
});

test('renderWorkspace writes lane dirs, .env, compose, projects.json', async () => {
  const dest = mkdtempSync(join(tmpdir(), 'vibe-ws-'));
  // Custom template with placeholders to prove substitution
  const tpl = 'services:\n  s:\n    image: busybox\n    command: ["sh","-lc","echo ${PROJECT}:${LANE}:${APP_PORT}"]\n    ports:\n      - "${APP_PORT}:${APP_PORT}"\n';
  const tplDir = join(dest, 'tpl'); mkdirSync(tplDir, { recursive: true }); writeFileSync(join(tplDir, 'docker-compose.yml'), tpl, 'utf8');

  const ports = { ci: { APP_PORT: 4001 }, staging: { APP_PORT: 4002 }, prod: { APP_PORT: 4003 } };
  const r = await renderWorkspace({ projectId: 'projX', destRoot: dest, lanes: ['ci','staging'], ports, templateDir: tplDir });

  const ciEnv = readFileSync(join(dest, 'projX', 'ci', '.env'), 'utf8');
  assert.match(ciEnv, /PROJECT=projX/);
  assert.match(ciEnv, /LANE=ci/);
  assert.match(ciEnv, /APP_PORT=4001/);

  const ciCompose = readFileSync(join(dest, 'projX', 'ci', 'docker-compose.yml'), 'utf8');
  assert.match(ciCompose, /projX:ci:4001/);
  assert.match(ciCompose, /"4001:4001"/);

  const pjson = JSON.parse(readFileSync(join(dest, 'projX', 'projects.json'), 'utf8'));
  assert.equal(pjson.project, 'projX');
  assert.ok(pjson.lanes.ci);
  assert.ok(pjson.lanes.staging);
  rmSync(dest, { recursive: true, force: true });
});
