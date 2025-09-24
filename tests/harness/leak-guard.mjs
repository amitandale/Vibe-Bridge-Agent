// tests/harness/leak-guard.mjs
// Wrap core async schedulers to tag errors with scheduling callsite.
const ENABLED = process.env.LEAK_GUARD !== "0";
if (!ENABLED) { console.error("[leak-guard] disabled via LEAK_GUARD=0"); }

const REG = new Map();
const INTERVALS = new Set();

function rel(p){
  try { return String(p).replace(/\\/g,'/').replace(process.cwd().replace(/\\/g,'/') + '/', ''); }
  catch { return String(p); }
}
function captureCallsite(){
  const e = new Error();
  const lines = (e.stack || "").split("\n").slice(2);
  for (const ln of lines) {
    if (!ln.includes("leak-guard.mjs")) {
      const m = ln.match(/\((.*?):(\d+):(\d+)\)/) || ln.match(/at (.*?):(\d+):(\d+)/);
      if (m) return `${rel(m[1])}:${m[2]}`;
    }
  }
  return "unknown";
}
function meta(type, site){ return { type, site, at: new Date().toISOString() }; }
function wrap(type, cb, site){
  if (typeof cb !== "function") return cb;
  const m = meta(type, site);
  function wrapped(...args){
    try { return cb.apply(this, args); }
    catch (err){ try { err.__leak = { type, site }; } catch {} throw err; }
    finally { if (REG.has(wrapped) && REG.get(wrapped).type !== "setInterval") REG.delete(wrapped); }
  }
  REG.set(wrapped, m);
  return wrapped;
}
function logLeakSummary(prefix){
  if (REG.size === 0 && INTERVALS.size === 0) return;
  console.error(prefix || "[leak-guard] outstanding async after tests:");
  for (const [, m] of REG.entries()) console.error(` - pending ${m.type} scheduled at ${m.site} @ ${m.at}`);
  for (const t of INTERVALS){ const m = t && t.__leak_meta; if (m) console.error(` - active setInterval scheduled at ${m.site} @ ${m.at}`); }
}

if (ENABLED){
  const _setTimeout = global.setTimeout;
  const _setImmediate = global.setImmediate;
  const _setInterval = global.setInterval;
  const _queueMicrotask = global.queueMicrotask || ((fn)=>Promise.resolve().then(fn));
  const _nextTick = process.nextTick;

  const _clearTimeout = global.clearTimeout;
  const _clearImmediate = global.clearImmediate;
  const _clearInterval = global.clearInterval;

  global.setTimeout = function(cb, ms, ...rest){ const site = captureCallsite(); return _setTimeout(wrap("setTimeout", cb, site), ms, ...rest); };
  global.setImmediate = function(cb, ...rest){ const site = captureCallsite(); return _setImmediate(wrap("setImmediate", cb, site), ...rest); };
  global.setInterval = function(cb, ms, ...rest){ const site = captureCallsite(); const wrapped = wrap("setInterval", cb, site); const t = _setInterval(wrapped, ms, ...rest); try { t.__leak_meta = meta("setInterval", site); } catch {} INTERVALS.add(t); return t; };
  global.queueMicrotask = function(cb){ const site = captureCallsite(); return _queueMicrotask(wrap("queueMicrotask", cb, site)); };
  process.nextTick = function(cb, ...rest){ const site = captureCallsite(); return _nextTick.call(process, wrap("nextTick", cb, site), ...rest); };

  global.clearTimeout = function(h){ try { _clearTimeout(h); } catch {} };
  global.clearImmediate = function(h){ try { _clearImmediate(h); } catch {} };
  global.clearInterval = function(h){ try { INTERVALS.delete(h); _clearInterval(h); } catch {} };

  process.on("uncaughtException", (err)=>{
    if (process.env.LEAK_GUARD_VERBOSE === "1") console.error("[leak-guard] uncaughtException", err && err.stack || err);
    const tag = err && err.__leak;
    if (tag) console.error(`[leak-guard] error from ${tag.type} scheduled at ${tag.site}`);
    else { console.error("[leak-guard] uncaughtException with no tag. Recent pending tasks:"); logLeakSummary(); }
  });
  process.on("unhandledRejection", (reason)=>{
    if (process.env.LEAK_GUARD_VERBOSE === "1") console.error("[leak-guard] unhandledRejection", reason && reason.stack || reason);
    const err = reason instanceof Error ? reason : null;
    const tag = err && err.__leak;
    if (tag) console.error(`[leak-guard] rejection from ${tag.type} scheduled at ${tag.site}`);
    else { console.error("[leak-guard] unhandledRejection with no tag. Recent pending tasks:"); logLeakSummary(); }
  });
  process.on("beforeExit", ()=>{ logLeakSummary("[leak-guard] summary before exit:"); });
}
export {};
