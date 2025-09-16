// tests/tokenBroker.projectBinding.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { migrate } from '../lib/db/migrate.mjs';
import { setRepoBinding } from '../lib/repo/projects.mjs';
import { getInstallationTokenForProject } from '../lib/github/tokenBroker.mjs';

function startServer(handler){
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({ srv, url: `http://${addr.address}:${addr.port}` });
    });
  });
}

test('tokenBroker respects bound repo', async () => {
  migrate({});
  setRepoBinding('p3', { owner:'ownerX', repo:'repoY' });
  const { srv, url } = await startServer((req, res) => {
    if (req.url === '/broker/github/installation-token'){
      let body=''; req.on('data', c=> body+=c); req.on('end', () => {
        const json = JSON.parse(body);
        // Assert forwarded owner/repo from binding
        if (json.owner === 'ownerX' && json.repo === 'repoY'){
          res.setHeader('content-type','application/json');
          res.end(JSON.stringify({ token:'ok', expiresAt: Date.now()+60000 }));
        } else {
          res.statusCode = 400; res.end('mismatch');
        }
      });
    } else { res.statusCode = 404; res.end('not found'); }
  });
  process.env.SaaS_URL = url;
  process.env.AGENT_ID = 'agent1';
  process.env.AGENT_SECRET = 'shh';
  const tok = await getInstallationTokenForProject('p3');
  assert.equal(tok.token, 'ok');
  srv.close();
});
