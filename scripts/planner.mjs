#!/usr/bin/env node
// scripts/planner.mjs
import fs from 'node:fs/promises';
import { planPR } from '../lib/planner/index.mjs';

function parseArgs(argv){
  const args = { labels:[], mode:'PR' };
  for (let i=2;i<argv.length;i++){
    const a = argv[i];
    if (a==='build' || a==='dry-run') { args.cmd = a; continue; }
    if (a==='--pr') { args.pr = argv[++i]; continue; }
    if (a==='--commit') { args.commit = argv[++i]; continue; }
    if (a==='--branch') { args.branch = argv[++i]; continue; }
    if (a==='--mode') { args.mode = argv[++i]; continue; }
    if (a==='--labels') { args.labels = argv[++i].split(',').filter(Boolean); continue; }
    if (a==='--diff') { args.diffPath = argv[++i]; continue; }
    if (a==='--out') { args.out = argv[++i]; continue; }
  }
  return args;
}

async function main(){
  const a = parseArgs(process.argv);
  if (!a.cmd || !a.pr || !a.commit) {
    console.error('Usage: node scripts/planner.mjs build --pr <id> --commit <sha> [--branch work] [--mode PR] [--labels a,b] [--diff path] [--out pack.json]');
    process.exit(2);
  }
  const diff = a.diffPath ? await fs.readFile(a.diffPath,'utf8') : '';
  const pack = planPR({
    projectId: process.env.PROJECT_ID || 'unknown',
    pr: { id: a.pr, branch: a.branch || process.env.GIT_BRANCH || 'work', commit_sha: a.commit },
    mode: a.mode,
    labels: a.labels,
    diff,
    fileContents: {},
  });
  if (a.cmd === 'dry-run') {
    const diffSlices = pack.sections.find(s=>s.name==='diff_slices').items.length;
    console.log(JSON.stringify({ ok:true, sections: pack.sections.map(s=>({name:s.name, n:s.items.length})), diffSlices }, null, 2));
    process.exit(0);
  } else {
    const out = JSON.stringify(pack, null, 2);
    if (a.out) await fs.writeFile(a.out, out);
    else process.stdout.write(out);
    process.exit(0);
  }
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
