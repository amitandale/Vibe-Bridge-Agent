// tests/security.nonceCache.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { NonceCache } from "../lib/security/nonceCache.mjs";

test("NonceCache insertIfAbsent returns true then false for duplicates", async () => {
  const c = new NonceCache({ ttlDefaultS: 3600 });
  assert.equal(await c.insertIfAbsent("id1"), true);
  assert.equal(await c.insertIfAbsent("id1"), false);
});

test("NonceCache TTL expiry allows reuse after sweep", async () => {
  const c = new NonceCache({ ttlDefaultS: 1 });
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    assert.equal(await c.insertIfAbsent("id2"), true);
    now += 2000;
    c.sweep(Date.now());
    assert.equal(await c.insertIfAbsent("id2"), true);
  } finally {
    Date.now = realNow;
  }
});
