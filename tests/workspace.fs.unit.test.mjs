// tests/workspace.fs.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFs, desiredLayout } from '../lib/workspace/fs.mjs';

function makeFsAdapter({ worldWritable=false, availGiB=100 }={}){
  const dirs = new Set();
  const stats = new Map();
  const mkst = (mode)=>({ mode, uid:1000, gid:1000 });
  return {
    fs: {
      async exists(p){ return dirs.has(p); },
      async mkdir(p,mode){ dirs.add(p); stats.set(p, mkst(mode)); },
      async chmod(p,mode){ const st = stats.get(p) || mkst(mode); st.mode = mode; stats.set(p, st); },
      async stat(p){ const st = stats.get(p) || mkst(0o750); if (worldWritable) st.mode |= 0o002; return st; },
      async statvfs(p){ return { bavail: BigInt(Math.floor(availGiB * 1024**3 / 4096)), frsize: 4096 }; },
    }
  };
}

test('fs ok when perms safe and disk above threshold', async () => {
  const adapter = makeFsAdapter({ worldWritable:false, availGiB: 50 });
  const r = await checkFs({ projectId:'p1' }, adapter);
  assert.equal(r.ok, true);
  const l = desiredLayout('p1');
  assert.equal(r.layout.base, l.base);
});

test('world-writable dir triggers E_FS_PERMS', async () => {
  const adapter = makeFsAdapter({ worldWritable:true, availGiB: 50 });
  const r = await checkFs({ projectId:'p1' }, adapter);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_FS_PERMS');
  assert.ok(r.hint.includes('o-w'));
});

test('low disk triggers E_DISK_LOW', async () => {
  process.env.CAP_DISK_MIN_GB = '10';
  const adapter = makeFsAdapter({ worldWritable:false, availGiB: 2 });
  const r = await checkFs({ projectId:'p1' }, adapter);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_DISK_LOW');
});
