// tests/workspace.ports.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePortMap } from '../lib/workspace/render.mjs';

test('port map validation detects conflicts and bad values', () => {
  assert.equal(validatePortMap({ ci: { APP_PORT: 3001 }, staging: { APP_PORT: 3002 } }), true);

  assert.throws(() => validatePortMap({ ci: { APP_PORT: 0 } }), /BAD_PORT/);
  assert.throws(() => validatePortMap({ ci: { A: 3001, B: 3001 } }), /DUP_PORT_IN_LANE/);
  assert.throws(() => validatePortMap({ ci: { A: 3001 }, staging: { B: 3001 } }), /PORT_CONFLICT/);
});
