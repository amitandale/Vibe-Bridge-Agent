// lib/planner/logic.mjs
import { createHash } from 'node:crypto';

const ORDER = ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'];

function sha256(s){ return createHash('sha256').update(Buffer.from(String(s))).digest('hex'); }
function normPath(p){ return String(p || '').replace(/\\/g, '/').replace(/^\.\//, ''); }

function defaultBudgets() {
  return {
    max_tokens: 20000,
    max_files: 200,
    max_per_file_tokens: 8000,
    section_caps: { templates:5, spec_canvas:2, diff_slices:80, linked_tests:40, contracts:10, extras:20 }
  };
}

function isMigration(path){ return /(?:^|\/)migrations\//.test(path) || /\.(sql|psql|ddl)$/i.test(path); }
  };
}

function parseSimpleDiff(diffText='') {
  const added = new Set();
  const renamed = [];
  const lines = diffText.replace(/\r\n/g,'\n').split('\n');
  for (let i=0;i<lines.length;i++) {
    const line = lines[i];
    if (line.startsWith('+++ b/')) added.add(normPath(line.slice(6)));
    if (line.startsWith('rename from ')) {
      const from = normPath(line.slice('rename from '.length));
      // lookahead for rename to
      let to = null;
      if (i+1 < lines.length && lines[i+1].startsWith('rename to ')) {
        to = normPath(lines[i+1].slice('rename to '.length));
      }
      renamed.push({ from, to });
    }
  }
  return { files: Array.from(added).sort(), renamed };
}

function symbolsForFile(path, content='') {
  const items = [];
  const lines = String(content).split(/\n/);
  for (let i=0;i<lines.length;i++) {
    const m = lines[i].match(/^\s*(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)/);
    if (m) {
      const name = m[3];
      let end=i+1;
      while (end<lines.length && lines[end].trim() !== '') end++;
      items.push({ kind:'symbol', section:'diff_slices', loc:{ path: normPath(path), start_line:i+1, end_line:end }, symbol:name, sha256: sha256(lines[i]) , source:'fs' });
    }
  }
  if (items.length===0) {
    items.push({ kind:'file', section:'diff_slices', loc:{ path: normPath(path), start_line:1 }, sha256: sha256(content), source:'fs' });
  }
  // stable sort by symbol then path+line
  return items.sort((a,b)=> (a.symbol||'').localeCompare(b.symbol||'') || a.loc.path.localeCompare(b.loc.path) || (a.loc.start_line-(b.loc.start_line||0)));
}

function linkTests(touchedFiles=[], failingTests=[]) {
  const set = new Set();
  for (const f of touchedFiles) {
    const base = f.split('/').pop().replace(/\.[^.]+$/, '');
    set.add(`tests/${base}.test.mjs`);
  }
  for (const t of failingTests) {
    if (t?.path) set.add(normPath(t.path));
  }
  return Array.from(set).sort().map(p => ({ id: p, path:p, content:'', sha256: sha256(p) }));
}

function selectTemplates(labels=[]) {
  const out = [];
  const add = (id, content) => out.push({ id, content, path: `templates/${id}.md`, sha256: sha256(content) });
  if (labels.includes('api')) add('api/route-contract', 'Contract: API route');
  if (labels.includes('db')) add('db/migration-invariants', 'DB invariants');
  if (labels.includes('ui')) add('ui/components-guidelines', 'UI guidelines');
  if (out.length===0) add('general/base', 'General PR template');
  return out.sort((a,b)=>a.id.localeCompare(b.id));
}

function placeSections({ touchedFiles, labels, failingTests=[] }) {
  const sections = [
    { name:'templates', items: selectTemplates(labels) },
    { name:'spec_canvas', items: [] },
    { name:'diff_slices', items: [] },
    { name:'linked_tests', items: linkTests(touchedFiles, failingTests) },
    { name:'contracts', items: [] },
    { name:'extras', items: [] },
  ];
  return sections;
}

function applyBudgets({ sections, budgets }) {
  const out = sections.map(s => ({ name:s.name, items:[...s.items] }));
  const caps = budgets.section_caps || {};
  const keep = (s) => ['diff_slices','contracts'].includes(s.name);
  for (const s of out) {
    const cap = caps[s.name] ?? Number.MAX_SAFE_INTEGER;
    if (s.items.length > cap && !keep(s)) {
      s.items = s.items.slice(0, cap);
    }
  }
  return out;
}

export function planFromSignals({ labels=[], diff='', fileContents = {}, failingTests=[] } = {}) {
  const { files, renamed } = parseSimpleDiff(diff || '');
  const touchedFiles = files;
  const must_include = [];
  const provenance = [{ source:'planner', generator:'ba/planner', created_at:new Date().toISOString() }];

  // Add rename provenance if any
  for (const r of renamed) {
    provenance.push({ source:'git', generator:'ba/planner', created_at:new Date().toISOString(), old_path:r.from || undefined, new_path:r.to || undefined });
  }

  // Collect items for diff_slices or contracts if migrations
  const diffItems = [];
  const contractItems = [];
  for (const f of touchedFiles) {
    const content = fileContents[f] || '';
    if (isMigration(f)) {
      const id = normPath(f);
      const sha = sha256(content);
      contractItems.push({ id, path: id, content: '', sha256: sha });
      must_include.push({ kind:'file', section:'contracts', loc:{ path:id, start_line:1 }, sha256: sha, source:'fs', reason:'migration' });
      continue;
    }
    const syms = symbolsForFile(f, content);
    for (const s of syms) must_include.push(s);
    // mirror into diff section items
    for (const m of syms) diffItems.push({ id: m.symbol ? `${m.loc.path}#${m.symbol}` : m.loc.path, path: m.loc.path, content: '', sha256: m.sha256 });
  }

  // Sections
  const sections0 = placeSections({ touchedFiles, labels, failingTests });
  sections0.find(s => s.name==='diff_slices').items = diffItems;
  sections0.find(s => s.name==='contracts').items.push(...contractItems);

  // Budgets and order
  const budgets = defaultBudgets();
  // Enforce per-section caps
  let sections = applyBudgets({ sections: sections0, budgets });
  // Enforce global max_files without evicting essentials
  const omissions = enforceGlobalBudget({ sections, budgets });

  // Stable sort items by id for determinism
  for (const s of sections) s.items.sort((a,b)=>a.id.localeCompare(b.id));
  must_include.sort((a,b)=> {
    const ak = [a.section, a.loc?.path || '', a.loc?.start_line || 0, a.symbol || ''].join('|');
    const bk = [b.section, b.loc?.path || '', b.loc?.start_line || 0, b.symbol || ''].join('|');
    return ak.localeCompare(bk);
  });

  return {
    order: ORDER.slice(),
    budgets,
    sections,
    must_include,
    nice_to_have: [],
    never_include: [],
    provenance,
    omissions
  };
}
