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

// convenience alias
if (!globalThis.test) globalThis.test = nodeTest;
