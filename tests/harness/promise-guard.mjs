// tests/harness/promise-guard.mjs
// Tag microtasks scheduled via Promise.then/catch/finally with their scheduling callsite.
const ENABLED = process.env.LEAK_GUARD !== "0";
if (!ENABLED) { console.error("[promise-guard] disabled via LEAK_GUARD=0"); }

function rel(p){
  try { return String(p).replace(/\\/g,'/').replace(process.cwd().replace(/\\/g,'/') + '/', ''); }
  catch { return String(p); }
}
function captureCallsite(){
  const e = new Error();
  const lines = (e.stack || "").split("\n").slice(2);
  for (const ln of lines) {
    if (!ln.includes("promise-guard.mjs")) {
      const m = ln.match(/\((.*?):(\d+):(\d+)\)/) || ln.match(/at (.*?):(\d+):(\d+)/);
      if (m) return `${rel(m[1])}:${m[2]}`;
    }
  }
  return "unknown";
}
function tagError(err, site, type){
  try { if (err && typeof err === "object") err.__leak = { type, site }; } catch {}
}

if (ENABLED){
  const _then = Promise.prototype.then;
  const _catch = Promise.prototype.catch;
  const _finally = Promise.prototype.finally;

  Promise.prototype.then = function(onFulfilled, onRejected){
    const site = captureCallsite();
    const wrap = (fn, type) => typeof fn === "function" ? function(...args){ try { return fn.apply(this, args); } catch (e){ tagError(e, site, type); throw e; } } : fn;
    return _then.call(this, wrap(onFulfilled, "Promise.then"), wrap(onRejected, "Promise.then"));
  };
  Promise.prototype.catch = function(onRejected){
    const site = captureCallsite();
    const wrap = typeof onRejected === "function" ? function(...args){ try { return onRejected.apply(this, args); } catch (e){ tagError(e, site, "Promise.catch"); throw e; } } : onRejected;
    return _catch.call(this, wrap);
  };
  Promise.prototype.finally = function(onFinally){
    const site = captureCallsite();
    const wrap = typeof onFinally === "function" ? function(...args){ try { return onFinally.apply(this, args); } catch (e){ tagError(e, site, "Promise.finally"); throw e; } } : onFinally;
    return _finally.call(this, wrap);
  };
}
export {};
