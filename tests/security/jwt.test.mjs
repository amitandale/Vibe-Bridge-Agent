// tests/security/jwt.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { verifyJwt } from "../../lib/security/jwt.mjs";

function jwkFromKeyObject(pubKeyObj) {
  // Export JWK if possible, else build from components
  const jwk = pubKeyObj.export({ format: "jwk" });
  jwk.alg = "RS256";
  jwk.kid = "k1";
  jwk.use = "sig";
  return jwk;
}

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

test("verifyJwt ok and rejects wrong aud/iss/exp", async (t) => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = jwkFromKeyObject(publicKey);

  // Tiny JWKS server
  const server = http.createServer((req, res) => {
    if (req.url === "/.well-known/jwks.json") {
      const body = JSON.stringify({ keys: [jwk] });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "max-age=60" });
      return res.end(body);
    }
    res.statusCode = 404; res.end("nf");
  });
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/.well-known/jwks.json`;

  const nowS = Math.floor(Date.now()/1000);
  const base = { iss: "saas", aud: "bridge", sub: "proj1", iat: nowS, nbf: nowS-10, exp: nowS+300, jti: "abc" };

  const good = signJwt(base, privateKey);
  const ok = await verifyJwt(good, { jwksUrl: url, aud: "bridge", iss: "saas", clockSkewS: 90 });
  assert.equal(ok.payload.sub, "proj1");

  await assert.rejects(() => verifyJwt(signJwt({ ...base, aud: "x" }, privateKey), { jwksUrl: url, aud: "bridge", iss: "saas" }));

  await assert.rejects(() => verifyJwt(signJwt({ ...base, iss: "x" }, privateKey), { jwksUrl: url, aud: "bridge", iss: "saas" }));

  await assert.rejects(() => verifyJwt(signJwt({ ...base, exp: nowS-1 }, privateKey), { jwksUrl: url, aud: "bridge", iss: "saas", clockSkewS: 0 }));

  server.close();
});