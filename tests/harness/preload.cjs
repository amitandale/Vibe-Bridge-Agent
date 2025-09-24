// tests/harness/preload.cjs
// CommonJS preload. Use with: NODE_OPTIONS="--require ./tests/harness/preload.cjs"
// Purpose: attribute late async errors to scheduling callsite across Node 18/20 runners.

const ENABLED = process.env.LEAK_GUARD !== "0";

function rel(p){
  try { return String(p).replace(/\\/g,'/').replace(process.cwd().replace(/\\/g,'/') + '/', ''); }
  catch { return String(p); }
}
function callsite(skipSelfMatch){
  const e = new Error();
  const lines = (e.stack || "").split("\n").slice(2);
  for (const ln of lines) {
    if (skipSelfMatch && ln.includes("preload.cjs")) continue;
    const m = ln.match(/\((.*?):(\d+):(\d+)\)/) || ln.match(/at (.*?):(\d+):(\d+)/);
    if (m) return `${rel(m[1])}:${m[2]}`;
  }
  return "unknown";
}
function tag(err, meta){
  try { if (err && typeof err === "object") err.__leak = Object.assign(err.__leak || {}, meta); } catch {}
}

if (ENABLED) {
  const REG = new Map();
  const INTERVALS = new Set();

  function meta(type, site){ return { type, site, at: new Date().toISOString() }; }
  function wrap(type, fn, site){
    if (typeof fn !== "function") return fn;
    const m = meta(type, site);
    function wrapped(...args){
      try { return fn.apply(this, args); }
      catch (e){ tag(e, m); throw e; }
      finally { if (REG.has(wrapped) && REG.get(wrapped).type !== "setInterval") REG.delete(wrapped); }
    }
    REG.set(wrapped, m);
    return wrapped;
  }
  function summary(prefix){
    if (!REG.size && !INTERVALS.size) return;
    console.error(prefix || "[preload] pending async:");
    for (const [,m] of REG.entries()) console.error(` - pending ${m.type} scheduled at ${m.site} @ ${m.at}`);
    for (const t of INTERVALS){ const m = t && t.__leak_meta; if (m) console.error(` - active setInterval scheduled at ${m.site} @ ${m.at}`); }
  }

  // Timers + microtasks
  const _setTimeout = global.setTimeout;
  const _setImmediate = global.setImmediate;
  const _setInterval = global.setInterval;
  const _queueMicrotask = global.queueMicrotask || (cb => Promise.resolve().then(cb));
  const _nextTick = process.nextTick;

  const _clearTimeout = global.clearTimeout;
  const _clearImmediate = global.clearImmediate;
  const _clearInterval = global.clearInterval;

  global.setTimeout = function(cb, ms, ...rest){ const site = callsite(true); return _setTimeout(wrap("setTimeout", cb, site), ms, ...rest); };
  global.setImmediate = function(cb, ...rest){ const site = callsite(true); return _setImmediate(wrap("setImmediate", cb, site), ...rest); };
  global.setInterval = function(cb, ms, ...rest){ const site = callsite(true); const w = wrap("setInterval", cb, site); const t = _setInterval(w, ms, ...rest); try { t.__leak_meta = meta("setInterval", site);} catch{} INTERVALS.add(t); return t; };
  global.queueMicrotask = function(cb){ const site = callsite(true); return _queueMicrotask(wrap("queueMicrotask", cb, site)); };
  process.nextTick = function(cb, ...rest){ const site = callsite(true); return _nextTick.call(process, wrap("nextTick", cb, site), ...rest); };

  // Promise continuations
  const _then = Promise.prototype.then;
  const _catch = Promise.prototype.catch;
  const _finally = Promise.prototype.finally;
  Promise.prototype.then = function(onFulfilled, onRejected){
    const site = callsite(true);
    const w = f => typeof f === "function" ? function(...args){ try { return f.apply(this, args); } catch(e){ tag(e, meta("Promise.then", site)); throw e; } } : f;
    return _then.call(this, w(onFulfilled), w(onRejected));
  };
  Promise.prototype.catch = function(onRejected){
    const site = callsite(true);
    const w = typeof onRejected === "function" ? function(...args){ try { return onRejected.apply(this, args); } catch(e){ tag(e, meta("Promise.catch", site)); throw e; } } : onRejected;
    return _catch.call(this, w);
  };
  Promise.prototype.finally = function(onFinally){
    const site = callsite(true);
    const w = typeof onFinally === "function" ? function(...args){ try { return onFinally.apply(this, args); } catch(e){ tag(e, meta("Promise.finally", site)); throw e; } } : onFinally;
    return _finally.call(this, w);
  };

  process.on("uncaughtException", (err) => {
    const tagInfo = err && err.__leak;
    if (tagInfo) {
      console.error(`[async-guardian] uncaught from ${tagInfo.type} scheduled at ${tagInfo.site}`);
    } else {
      console.error("[async-guardian] uncaughtException with no tag. Recent pending tasks:");
      summary();
    }
  });
  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : null;
    const tagInfo = err && err.__leak;
    if (tagInfo) {
      console.error(`[async-guardian] rejection from ${tagInfo.type} scheduled at ${tagInfo.site}`);
    } else {
      console.error("[async-guardian] unhandledRejection with no tag. Recent pending tasks:");
      summary();
    }
  });
  process.on("beforeExit", () => { summary("[async-guardian] summary before exit:"); });
}

module.exports = {}; // ensure CJS
