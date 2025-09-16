// tests/obs.errors.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { httpError, toResponse, Codes } from "../lib/obs/errors.mjs";

test("httpError shapes the body and status", () => {
  const err = httpError(Codes.ERR_BAD_INPUT, "bad", 400, { field: "x" });
  assert.equal(err.status, 400);
  assert.deepEqual(err.body, { error: { code: Codes.ERR_BAD_INPUT, message: "bad", details: { field: "x" } } });
});

test("toResponse writes JSON and returns err", () => {
  const err = httpError(Codes.ERR_INTERNAL, "boom", 500);
  const headers = {};
  let ended = false;
  const res = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    end: (s) => { ended = s; },
  };
  const out = toResponse(res, err);
  assert.equal(out, err);
  assert.equal(headers["content-type"], "application/json; charset=utf-8");
  assert.equal(JSON.parse(ended).error.message, "boom");
});
