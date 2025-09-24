import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPack } from '../lib/ctxpack/builder.mjs';
import { validateObject } from '../lib/ctxpack/index.mjs';
import { gate } from '../lib/ctxpack/enforce.mjs';

test('builder: builds a valid minimal pack', () => {
  const p = buildPack({ projectId:'demo', pr:{id:'1', branch:'work', commit_sha:'deadbee'}, sections: [] });
  const v = validateObject(p, { strictOrder:true });
  assert.equal(v.ok, true);
  assert.doesNotThrow(()=>gate(p,{mode:'enforce'}));
});
