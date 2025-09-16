// tests/github.tokenBroker.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getInstallationToken, getRunnerRegistrationToken } from '../lib/github/tokenBroker.mjs';

function startServer(handler){
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({ srv, url: `http://${addr.address}:${addr.port}` });
    });
  });
}

test('token broker: installation and runner tokens', async () => {
  const { srv, url } = await startServer((req, res) => {
    let body='';
    req.on('data', c => body += c);
    req.on('end', () => {
      if (req.url === '/broker/github/installation-token'){
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ token: 'inst_abc', expiresAt: Date.now()+60000 }));
      } else if (req.url === '/broker/github/runner-registration-token'){
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ token: 'run_abc', expiresAt: Date.now()+60000 }));
      } else {
        res.statusCode = 404; res.end('not found');
      }
    });
  });

  process.env.SaaS_URL = url;
  process.env.AGENT_ID = 'agent1';
  process.env.AGENT_SECRET = 'shh';

  const a = await getInstallationToken({ owner:'o', repo:'r' });
  assert.equal(typeof a.token, 'string');
  assert.ok(a.token.startsWith('inst_'));

  const b = await getRunnerRegistrationToken({ owner:'o', repo:'r' });
  assert.equal(typeof b.token, 'string');
  assert.ok(b.token.startsWith('run_'));

  srv.close();
});

test('token broker: errors bubble up', async () => {
  const { srv, url } = await startServer((req, res) => {
    res.statusCode = 401;
    res.end('nope');
  });
  process.env.SaaS_URL = url;
  process.env.AGENT_ID = 'agent1';
  process.env.AGENT_SECRET = 'shh';
  let threw = false;
  try {
    await getInstallationToken({ owner:'o', repo:'r' });
  } catch (e) {
    threw = true;
    assert.equal(e.statusCode, 401);
  }
  assert.equal(threw, true);
  srv.close();
});
