import tap from 'tap';
import { execSync } from 'child_process';
import path from 'path';

tap.test('wire script runs', async t=>{
  const p = path.join(process.cwd(), 'scripts', 'patch', 'wire-hmac.mjs');
  try {
    execSync('node ' + p, { stdio: 'inherit', cwd: process.cwd(), env: process.env, timeout: 20000 });
    t.ok(true, 'script executed');
  } catch (e) {
    t.fail('script failed: ' + String(e));
  }
  t.end();
});
