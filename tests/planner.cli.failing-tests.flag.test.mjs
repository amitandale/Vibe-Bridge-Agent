import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function execFileP(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

test('planner --failing-tests influences linked_tests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'planner-'));
  const ftPath = join(dir, 'failing.json');
  writeFileSync(ftPath, JSON.stringify([{ path: 'tests/util.test.mjs' }]));
  const diffPath = join(dir, 'd.diff');
  writeFileSync(diffPath, 'diff --git a/lib/core/util.mjs b/lib/core/util.mjs\n'
                        + '--- a/lib/core/util.mjs\n'
                        + '+++ b/lib/core/util.mjs\n'
                        + '@@ -0,0 +1 @@\n'
                        + '+export const z=1;\n');
  const { stdout } = await execFileP('node', [
    'scripts/planner.mjs','build','--pr','1','--commit','deadbeef',
    '--mode','PR','--diff',diffPath,'--failing-tests',ftPath
  ], { timeout: 20000 });
  const pack = JSON.parse(stdout);
  const linked = pack.sections.find(s=>s.name==='linked_tests').items.map(i=>i.id);
  assert.ok(linked.includes('tests/util.test.mjs'));
});
