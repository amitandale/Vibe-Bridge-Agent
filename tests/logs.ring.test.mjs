// tests/logs.ring.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { makeRing } from "../lib/logs/ring.mjs";

test("ring appends and since() tails correctly", () => {
  const r = makeRing({ maxEvents: 5, maxBytes: 10_000 });
  for (let i = 1; i <= 3; i++) r.append({ msg: "e" + i });
  assert.equal(r.lastSeq(), 3);
  const tail = r.since();
  assert.equal(tail.length, 3);
  assert.deepEqual(tail.map(e => e.msg), ["e1","e2","e3"]);
});

test("ring enforces maxEvents", () => {
  const r = makeRing({ maxEvents: 3, maxBytes: 10_000 });
  for (let i = 1; i <= 6; i++) r.append({ n: i });
  const tail = r.since();
  assert.equal(tail.length, 3);
  assert.deepEqual(tail.map(e => e.n), [4,5,6]);
  assert.equal(r.lastSeq(), 6);
});

test("ring enforces maxBytes approximately", () => {
  const r = makeRing({ maxEvents: 100, maxBytes: 50 });
  for (let i = 1; i <= 10; i++) r.append({ msg: "xxxxxxxxxx" });
  const tail = r.since();
  assert.ok(tail.length >= 1);
  assert.equal(tail.at(-1).seq, r.lastSeq());
});

test("since(cursor) returns only newer events", () => {
  const r = makeRing();
  r.append({ a: 1 });
  r.append({ a: 2 });
  const newer = r.since(1);
  assert.equal(newer.length, 1);
  assert.equal(newer[0].a, 2);
});
