#!/usr/bin/env node
// Usage: node scripts/ctxpack.mjs <validate|hash|print|assemble> <file>
import fs from 'node:fs/promises';
import { validateFile } from '../lib/ctxpack/validate.mjs';
import { sha256Canonical } from '../lib/ctxpack/hash.mjs';

const [, , cmd, file] = process.argv;

async function main() {
  if (!cmd || !file || !['validate','hash','print','assemble'].includes(cmd)) {
    console.error('Usage: node scripts/ctxpack.mjs <validate|hash|print|assemble> <file>');
    process.exit(2);
  }
  const raw = await fs.readFile(file, 'utf8');
  const obj = JSON.parse(raw);

  if (cmd === 'validate') {
    try {
      await validateFile(file, { strictOrder: true });
      console.log('ok');
      process.exit(0);
    } catch (err) {
      const msg = err && err.code ? `${err.code}:${err.message}` : String(err);
      console.error(msg);
      process.exit(1);
    }
  } else if (cmd === 'hash') {
    const h = sha256Canonical(obj);
    console.log(h);
    process.exit(0);
  } else if (cmd === 'assemble') {
    // Usage: node scripts/ctxpack.mjs assemble <pack.json> [--model gpt-xyz] [--dry-run] [--out manifest.json]
    const args = process.argv.slice(4);
    let model = 'gpt-xyz', dry = false, out = null;
    for (let i=0; i<args.length; i++){
      const a = args[i];
      if (a === '--dry-run') dry = true;
      else if (a === '--model') { model = args[i+1]; i++; }
      else if (a === '--out') { out = args[i+1]; i++; }
    }
    const { assemble } = await import('../lib/ctxpack/assemble.mjs');
    try {
      const { manifest } = await assemble(obj, { model });
      if (dry){
        const perSection = Object.fromEntries((manifest.sections||[]).map(s => [
          s.name, {
            files: (s.items||[]).length,
            tokens: (s.items||[]).reduce((a,i)=>a + Number(i.tokens||0), 0)
          }
        ]));
        const summary = { totals: manifest.totals, perSection };
        console.log(JSON.stringify(summary, null, 2));
        process.exit(0);
      }
      if (out){
        await fs.writeFile(out, JSON.stringify(manifest, null, 2), 'utf8');
        console.log(out);
        process.exit(0);
      } else {
        console.log(JSON.stringify(manifest, null, 2));
        process.exit(0);
      }
    } catch (err) {
      const code = err && err.code ? err.code : 'ASSEMBLY_ERROR';
      const msg = err && err.message ? err.message : String(err);
      console.error(`${code}:${msg}`);
      process.exit(1);
    }
  } else if (cmd === 'print') {
    console.log(JSON.stringify(obj, null, 2));
    process.exit(0);
  }
}
main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
