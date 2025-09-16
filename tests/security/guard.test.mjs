// tests/security/guard.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { requireTicket } from "../../lib/security/guard.mjs";

const RUN = process.env.RUN_BA01_TESTS === "true";

function b64u(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function signJwt(payload, key) {
  const header = { alg: "RS256", typ: "JWT", kid: "k1" };
  const enc = (obj) => b64u(Buffer.from(JSON.stringify(obj)));
  const input = enc(header) + "." + enc(payload);
  const sig = crypto.sign("RSA-SHA256", Buffer.from(input, "utf8"), key);
  return input + "." + b64u(sig);
}

test(RUN ? "guard allows valid ticket + scope and blocks replay" : "skipped guard e2e (set RUN_BA01_TESTS=true to run)", async (t) => {
  if (!RUN) return t.skip("set RUN_BA01_TESTS=true");

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }); jwk.kid = "k1"; jwk.alg="RS256"; jwk.use="sig";

  const server = http.createServer((req, res) => {
    if (req.url === "/jwks") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ keys: [jwk] }));
    }
    res.statusCode = 404; res.end("nf");
  });
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/jwks`;

  const nowS = Math.floor(Date.now()/1000);
  const base = { iss: "saas", aud: "bridge", sub: "proj1", iat: nowS, nbf: nowS-10, exp: nowS+300, jti: "nonce1", scope: "bridge:write" };
  const token = signJwt(base, privateKey);

  const req1 = { headers: { "x-vibe-project": "proj1", "x-vibe-ticket": token } };
  let ended = false; const res = { end: () => { ended = true; }, setHeader() {}, statusCode: 0 };
  const mw = requireTicket(["bridge:write"], { env: { VIBE_JWKS_URL: url, VIBE_TICKET_AUD: "bridge", VIBE_TICKET_ISS: "saas", GUARD_ENFORCE: "true" } });
  await mw(req1, res, () => { /* next */ });
  assert.equal(ended, false);
  assert.equal(req1.vibe.projectId, "proj1");

  // Replay
  const res2 = { end: () => { ended = true; }, setHeader() {}, statusCode: 0 };
  ended = false;
  await mw(req1, res2, () => {});
  assert.equal(ended, true);
  server.close();
});