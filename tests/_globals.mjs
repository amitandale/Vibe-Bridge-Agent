// tests/_globals.mjs
// Minimal mocha/Jest-like globals backed by node:test so top-level tests work.
import assert from 'node:assert/strict';
import {
  test as nodeTest,
  describe as nodeDescribe,
  it as nodeIt,
  before as nodeBefore,
  after as nodeAfter,
  beforeEach as nodeBeforeEach,
  afterEach as nodeAfterEach,
} from 'node:test';

// expect
function expectFn(received){
  return {
    toBe: (expected) => assert.strictEqual(received, expected),
    toEqual: (expected) => assert.deepStrictEqual(received, expected),
    toBeTruthy: () => assert.ok(received),
    toBeFalsy: () => assert.ok(!received),
  };
}
if (!globalThis.expect) globalThis.expect = expectFn;

// mocha-like globals wired to node:test
if (!globalThis.describe) globalThis.describe = nodeDescribe;
if (!globalThis.it)        globalThis.it = nodeIt;
if (!globalThis.before)    globalThis.before = nodeBefore;
if (!globalThis.after)     globalThis.after = nodeAfter;
if (!globalThis.beforeEach) globalThis.beforeEach = nodeBeforeEach;
if (!globalThis.afterEach)  globalThis.afterEach = nodeAfterEach;

// --- Begin hardening additions ---
// Install a network-off default fetch if none set
if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = async () => { throw new Error('Network disabled in tests'); };
}

// Snapshot env and timer APIs
const __originals = {
  env: { ...process.env },
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  DateNow: Date.now,
};
const __liveTimeouts = new Set();
const __liveIntervals = new Set();

// Wrap timers to track leaks
globalThis.setTimeout = (fn, ms, ...args) => {
  const id = __originals.setTimeout(() => {
    __liveTimeouts.delete(id);
    fn(...args);
  }, ms);
  __liveTimeouts.add(id);
  return id;
};
globalThis.clearTimeout = (id) => { __liveTimeouts.delete(id); return __originals.clearTimeout(id); };
globalThis.setInterval = (fn, ms, ...args) => {
  const id = __originals.setInterval(fn, ms, ...args);
  __liveIntervals.add(id);
  return id;
};
globalThis.clearInterval = (id) => { __liveIntervals.delete(id); return __originals.clearInterval(id); };

// Fail-fast on unhandledRejection to attribute to the active test
process.on?.('unhandledRejection', (err) => { throw err instanceof Error ? err : new Error(String(err)); });

// Clean up after each test
globalThis.afterEach?.(() => {
  // restore env exactly
  for (const k of Object.keys(process.env)) if (!(k in __originals.env)) delete process.env[k];
  Object.assign(process.env, __originals.env);

  // clear timers/intervals
  for (const id of Array.from(__liveTimeouts)) { __originals.clearTimeout(id); __liveTimeouts.delete(id); }
  for (const id of Array.from(__liveIntervals)) { __originals.clearInterval(id); __liveIntervals.delete(id); }

  // restore primordials
  globalThis.setTimeout = __originals.setTimeout;
  globalThis.clearTimeout = __originals.clearTimeout;
  globalThis.setInterval = __originals.setInterval;
  globalThis.clearInterval = __originals.clearInterval;
  Date.now = __originals.DateNow;
});
// --- End hardening additions ---

// convenience alias
if (!globalThis.test) globalThis.test = nodeTest;
