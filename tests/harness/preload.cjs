// tests/harness/preload.cjs
// Robust async attribution for Node's test runner.
// Load via: NODE_OPTIONS="--require ./tests/harness/preload.cjs"
// Captures scheduling site with AsyncLocalStorage and patches RegExp to annotate runtime regex errors.

const ENABLED = process.env.LEAK_GUARD !== "0";
if (!ENABLED) {
  console.error("[async-guardian] disabled via LEAK_GUARD=0");
  return;
}

const { AsyncLocalStorage } = require("node:async_hooks");
const als = new AsyncLocalStorage();

function rel(p){
  try { return String(p).replace(/\\/g,'/').replace(process.cwd().replace(/\\/g,'/') + '/', ''); }
  catch { return String(p); }
}
function callsite(skipSelf){
  const e = new Error();
  const lines = (e.stack || "").split("\n").slice(2);
  for (const ln of lines) {
    if (skipSelf && ln.includes("tests/harness/preload.cjs")) continue;
    const m = ln.match(/\((.*?):(\d+):(\d+)\)/) || ln.match(/at (.*?):(\d+):(\d+)/);
    if (m) return `${rel(m[1])}:${m[2]}`;
  }
  return "unknown";
}
function origin(type){
  return { type, site: callsite(true), at: new Date().toISOString() };
}
function runWithOrigin(type, fn, thisArg, args){
  const ctx = origin(type);
  return als.run(ctx, () => fn.apply(thisArg, args));
}
function tagAndPrint(err, extra){
  try {
    const ctx = als.getStore();
    if (ctx) {
      err.__async_origin = ctx;
    }
    if (extra && typeof extra === "object") {
      err.__extra = Object.assign(err.__extra || {}, extra);
    }
  } catch {}
  return err;
}

// ---- Patch timers and microtasks ----
const _setTimeout = global.setTimeout;
const _setImmediate = global.setImmediate;
const _setInterval = global.setInterval;
const _queueMicrotask = global.queueMicrotask || (cb => Promise.resolve().then(cb));
const _nextTick = process.nextTick;

global.setTimeout = function(cb, ms, ...rest){
  const site = callsite(true);
  return _setTimeout(function(...a){ return runWithOrigin("setTimeout@" + site, cb, this, a); }, ms, ...rest);
};
global.setImmediate = function(cb, ...rest){
  const site = callsite(true);
  return _setImmediate(function(...a){ return runWithOrigin("setImmediate@" + site, cb, this, a); }, ...rest);
};
global.setInterval = function(cb, ms, ...rest){
  const site = callsite(true);
  return _setInterval(function(...a){ return runWithOrigin("setInterval@" + site, cb, this, a); }, ms, ...rest);
};
global.queueMicrotask = function(cb){
  const site = callsite(true);
  return _queueMicrotask(function(){ return runWithOrigin("queueMicrotask@" + site, cb, this, []); });
};
process.nextTick = function(cb, ...rest){
  const site = callsite(true);
  return _nextTick.call(process, function(...a){ return runWithOrigin("nextTick@" + site, cb, this, a); }, ...rest);
};

// ---- Patch Promise continuations ----
const _then = Promise.prototype.then;
const _catch = Promise.prototype.catch;
const _finally = Promise.prototype.finally;

Promise.prototype.then = function(onFulfilled, onRejected){
  const site = callsite(true);
  const wrap = (fn, kind) => typeof fn === "function"
    ? function(...args){ return runWithOrigin(kind + "@" + site, fn, this, args); }
    : fn;
  return _then.call(this, wrap(onFulfilled, "Promise.then"), wrap(onRejected, "Promise.then"));
};
Promise.prototype.catch = function(onRejected){
  const site = callsite(true);
  const fn = typeof onRejected === "function"
    ? function(...args){ return runWithOrigin("Promise.catch@" + site, onRejected, this, args); }
    : onRejected;
  return _catch.call(this, fn);
};
Promise.prototype.finally = function(onFinally){
  const site = callsite(true);
  const fn = typeof onFinally === "function"
    ? function(...args){ return runWithOrigin("Promise.finally@" + site, onFinally, this, args); }
    : onFinally;
  return _finally.call(this, fn);
};

// ---- Guard RegExp to annotate runtime regex errors with construction site and async origin ----
const RealRegExp = RegExp;
function GuardedRegExp(pattern, flags){
  try {
    // Support 'new RegExp' and RegExp(...) calls
    return new RealRegExp(pattern, flags);
  } catch (e) {
    const site = callsite(true);
    tagAndPrint(e, { regex_site: site });
    // Enrich message once to avoid noise
    if (!e.__annotated) {
      const o = e.__async_origin;
      e.message += ` [regex at ${site}${o ? `; scheduled by ${o.type}` : ""}]`;
      e.__annotated = true;
    }
    throw e;
  }
}
GuardedRegExp.prototype = RealRegExp.prototype;
Object.setPrototypeOf(GuardedRegExp, RealRegExp);
global.RegExp = GuardedRegExp;

// ---- Global error reporters ----
process.on("uncaughtException", (err) => {
  const o = err && (err.__async_origin || (err.__extra && err.__extra.origin));
  if (o) {
    console.error(`[async-guardian] uncaught from ${o.type}`);
  } else {
    console.error("[async-guardian] uncaught with no async origin");
  }
  const rxSite = err && err.__extra && err.__extra.regex_site;
  if (rxSite) console.error(`[async-guardian] regex constructed at ${rxSite}`);
  if (err && err.stack) console.error(err.stack);
});
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  const o = err && (err.__async_origin || (err.__extra && err.__extra.origin));
  if (o) {
    console.error(`[async-guardian] rejection from ${o.type}`);
  } else {
    console.error("[async-guardian] rejection with no async origin");
  }
  const rxSite = err && err.__extra && err.__extra.regex_site;
  if (rxSite) console.error(`[async-guardian] regex constructed at ${rxSite}`);
  if (err && err.stack) console.error(err.stack);
});

