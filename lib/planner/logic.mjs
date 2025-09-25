// lib/planner/logic.mjs
import { createHash } from 'node:crypto';
import fs from 'node:fs';

// Deterministic timestamp to satisfy PR-CS-02 determinism
function deterministicIsoTimestamp({ labels=[], diff='', fileContents={}, failingTests=[] } = {}) {
  try {
    const keys = Object.keys(fileContents || {}).sort();
    const payload = JSON.stringify({ labels: [...labels].sort(), diff, keys, failingTests });
    const h = createHash('sha256').update(Buffer.from(payload)).digest();
    const secs = h.readUInt32BE(0);
    const ms = h.readUInt16BE(4) % 1000;
    return new Date(secs * 1000 + ms).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}


const ORDER = ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'];

function sha256(s){ return createHash('sha256').update(Buffer.from(String(s))).digest('hex'); }
function normPath(p){ return String(p || '').replace(/\\/g, '/').replace(/^\.\//, ''); }

function extractImports(source) {
  const out = new Set();
  const s = String(source || '');
  const re1 = /import\s+[^'"\n]+['\"]([^'\"]+)['\"]/g;
  const re2 = /import\(['\"]([^'\"]+)['\"]\)/g;
  const re3 = /require\(['\"]([^'\"]+)['\"]\)/g;
  let m;
  while ((m = re1.exec(s))) out.add(m[1]);
  while ((m = re2.exec(s))) out.add(m[1]);
  while ((m = re3.exec(s))) out.add(m[1]);
  return [...out];
}

function neighborExtras(touchedFiles, fileContents) {
  const extras = [];
  const keys = Object.keys(fileContents || {});
  const touched = new Set(touchedFiles || []);
  for (const f of touched) {
    const src = fileContents[f];
    const imports = extractImports(src);
    for (const imp of imports) {
      if (!imp.startsWith('.') && !imp.startsWith('/')) continue; // only local
      // naive resolution: try exact or with .mjs/.js/ts variations
      const cand = [normPath(imp), normPath(imp + '.mjs'), normPath(imp + '.js'), normPath(imp + '.ts')];
      const hit = cand.find(c => keys.includes(c));
      if (hit && !touched.has(hit)) {
        extras.push({ id: hit, path: hit, content: '', sha256: sha256(hit) });
      }
    }
  }
  // stable order
  extras.sort((a,b)=> a.path.localeCompare(b.path));
  return extras;
}

function defaultBudgets() {
  return {
    max_tokens: 20000,
    max_files: 200,
    max_per_file_tokens: 8000,
    section_caps: { templates:5, spec_canvas:2, diff_slices:80, linked_tests:40, contracts:10, extras:20 }
  };
}

function isMigration(path){ return /(?:^|\/)migrations\//.test(path) || /\.(sql|psql|ddl)$/i.test(path); }

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
  const explicit = new Set();
  for (const t of failingTests) {
    if (t?.path) explicit.add(normPath(t.path));
  }
  const guessed = new Set();
  for (const f of touchedFiles) {
    const base = f.split('/').pop().replace(/\.[^.]+$/, '');
    guessed.add(`tests/${base}.test.mjs`);
  }
  // Keep explicit failing tests always. Keep guessed only if file exists on disk.
  const out = new Set(explicit);
  for (const p of guessed) {
    try { if (fs.existsSync(p)) out.add(p); } catch {}
  }
  return Array.from(out).sort().map(p => ({ id: p, path:p, content:'', sha256: sha256(p) }));
}

  for (const t of failingTests) {
    if (t?.path) set.add(normPath(t.path));
  }
  return Array.from(set).sort().map(p => ({ id: p, path:p, content:'', sha256: sha256(p) }));
}

function selectTemplates(labels=[], registry) {
  const out = [];
  const add = (id, content) => out.push({ id, content, path: `templates/${id}.md`, sha256: sha256(content) });
  if (registry && typeof registry === 'object') {
    const picked = new Set();
    for (const lab of labels) {
      const arr = registry[lab] || [];
      for (const t of arr) {
        const id = String(t.id || t).trim();
        const content = String(t.content || t.body || '').trim() || `Template: ${id}`;
        const key = `${id}`;
        if (!picked.has(key)) { add(id, content); picked.add(key); }
      }
    }
    if (out.length === 0 && registry.general) {
      for (const t of registry.general) {
        const id = String(t.id || t).trim();
        const content = String(t.content || t.body || '').trim() || `Template: ${id}`;
        add(id, content);
      }
    }
  } else {
    if (labels.includes('api')) add('api/route-contract', 'Contract: API route');
    if (labels.includes('db')) add('db/migration-invariants', 'DB invariants');
    if (labels.includes('ui')) add('ui/components-guidelines', 'UI guidelines');
    if (out.length===0) add('general/base', 'General PR template');
  }
  return out.sort((a,b)=>a.id.localeCompare(b.id));
}


function neighborsFromImports(touchedFiles = [], fileContents = {}, maxHops = 1) {
  const resolved = new Set(touchedFiles.map(normPath));
  const extras = new Set();
  const importRe = /\bimport\s+[^'"]*from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let frontier = [...resolved];
  let hops = 0;
  function getContent(p){ return String(fileContents[normPath(p)] || ''); }
  while (frontier.length && hops < maxHops) {
    const next = [];
    for (const f of frontier) {
      const src = getContent(f);
      let m;
      while ((m = importRe.exec(src))) {
        const spec = m[1] || m[2];
        if (!spec) continue;
        if (!spec.startsWith('.')) continue; // only relative imports
        const parts = f.split('/'); parts.pop();
        const dir = parts.join('/');
        let rel = normPath((dir ? dir + '/' : '') + spec);
        if (!(rel in fileContents)) {
          if (!/\.[a-z]+$/i.test(rel)) {
            if (fileContents[rel + '.mjs']) rel = rel + '.mjs';
            else if (fileContents[rel + '.js']) rel = rel + '.js';
          } else if (rel.endsWith('.js') && fileContents[rel.replace(/\.js$/, '.mjs')]) {
            rel = rel.replace(/\.js$/, '.mjs');
          }
        }
        if (fileContents[rel] && !resolved.has(rel)) {
          extras.add(rel);
          next.push(rel);
          resolved.add(rel);
        }
      }
    }
    frontier = next;
    hops++;
  }
  return Array.from(extras).sort();
}
function placeSections({ touchedFiles, labels, failingTests=[], templatesRegistry } = {}) {
  // Safe fallback to avoid ReferenceError if neighborItems is out of scope
  const extrasItems = (typeof neighborItems !== 'undefined' && Array.isArray(neighborItems)) ? neighborItems : [];

  const sections = [
    { name:'templates', items: selectTemplates(labels, templatesRegistry) },
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


function enforceGlobalBudget({ sections, budgets }) {
  const priority = ['extras','linked_tests','templates','spec_canvas']; // never drop diff_slices or contracts // never drop diff_slices
  const hardMax = Number.isInteger(budgets?.max_files) ? budgets.max_files : Number.MAX_SAFE_INTEGER;
  const omissions = [];
  const total = () => sections.reduce((a,s)=>a + s.items.length, 0);
  while (total() > hardMax) {
    let dropped = false
    for (const name of priority) {
      const sec = sections.find(s=>s.name===name);
      if (!sec || sec.items.length === 0) continue;
      const it = sec.items.pop();
      omissions.push({ section: name, id: it.id, reason: 'global_max_files' });
      dropped = true;
      break;
    }
    if (!dropped) break;
  }
  return omissions;
}

export function planFromSignals({ labels=[], diff='', fileContents = {}, failingTests=[], templatesRegistry } = {}) {
  const { files, renamed } = parseSimpleDiff(diff || '');
  const touchedFiles = (files && files.length) ? files : Object.keys(fileContents || {}).sort();
  const templateItems = selectTemplates(labels, templatesRegistry);
  const createdAt = deterministicIsoTimestamp({ labels, diff, fileContents, failingTests });
  const must_include = [];
  const provenance = [{ source:'planner', generator:'ba/planner', created_at: createdAt }];

  // Add rename provenance if any
  for (const r of renamed) {
    provenance.push({ source:'git', generator:'ba/planner', created_at:new Date().toISOString(), old_path:r.from || undefined, new_path:r.to || undefined });
  }

  // Collect items for diff_slices or contracts if migrations
  const diffItems = [];
  const contractItems = [];
  const neighborItems = neighborExtras(touchedFiles, fileContents);

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
  const sections0 = placeSections({ touchedFiles, labels, failingTests, templatesRegistry });
  sections0.find(s => s.name==='diff_slices').items = diffItems;
  sections0.find(s => s.name==='contracts').items.push(...contractItems);
  // Add 1-hop neighbors by import edges into extras
  const neighborFiles = neighborsFromImports(touchedFiles, fileContents, 1);
  const extraItems = [];
  for (const nf of neighborFiles) {
    const content = fileContents[nf] || '';
    const syms = symbolsForFile(nf, content);
    for (const s of syms) extraItems.push({ id: s.symbol ? `${s.loc.path}#${s.symbol}` : s.loc.path, path: s.loc.path, content: '', sha256: s.sha256 });
  }
  sections0.find(s => s.name==='extras').items.push(...extraItems);

  // If no linked tests, add a contract stub and record provenance reason
  const _linkedSec = sections0.find(s => s.name==='linked_tests');
  if ((_linkedSec?.items?.length || 0) === 0) {
    const _id = 'contracts/no-tests-found.stub';
    const _sha = sha256(_id);
    sections0.find(s => s.name==='contracts').items.push({ id: _id, path: _id, content: '', sha256: _sha });
    provenance.push({ source:'planner', generator:'ba/planner', created_at: createdAt, reason:'no_tests_found' });
  }


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