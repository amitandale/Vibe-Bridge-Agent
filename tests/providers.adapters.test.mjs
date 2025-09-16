// tests/providers.adapters.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postDeploy, getDeployStatus, getPreviewUrl } from '../lib/routes/deploy.api.mjs';

test('vercel happy path', async () => {
  const fake = async (url, opts) => {
    if (url.endsWith('/deploy')) return new Response(JSON.stringify({ id:'d1' }), { status:200 });
    if (url.endsWith('/status')) return new Response(JSON.stringify({ state:'READY' }), { status:200 });
    if (url.endsWith('/preview')) return new Response(JSON.stringify({ url:'https://p.example' }), { status:200 });
    return new Response('{}', { status:404 });
  };
  const d = await postDeploy({ provider:'vercel', repo:'x/y', framework:'next', fetchImpl:fake });
  assert.equal(d.ok, true);
  const s = await getDeployStatus({ provider:'vercel', id:'d1', fetchImpl:fake });
  assert.equal(s.ready, true);
  const p = await getPreviewUrl({ provider:'vercel', id:'d1', fetchImpl:fake });
  assert.equal(p.url, 'https://p.example');
});

test('gcp retry on 500 then success', async () => {
  let calls = 0;
  const fake = async (url, opts) => {
    if (url.includes('/status')){
      calls++;
      if (calls < 2) return new Response(JSON.stringify({}), { status:500 });
      return new Response(JSON.stringify({ state:'READY' }), { status:200 });
    }
    if (url.includes('/deploy')) return new Response(JSON.stringify({ id:'g1' }), { status:200 });
    if (url.includes('/preview')) return new Response(JSON.stringify({ url:'https://gcp.prev' }), { status:200 });
    return new Response('{}', { status:404 });
  };
  const d = await postDeploy({ provider:'gcp', repo:'x/y', framework:'node', fetchImpl:fake });
  assert.equal(d.id, 'g1');
  const s = await getDeployStatus({ provider:'gcp', id:'g1', fetchImpl:fake });
  assert.equal(s.state, 'READY');
  const p = await getPreviewUrl({ provider:'gcp', id:'g1', fetchImpl:fake });
  assert.equal(p.ok, true);
});

test('forbidden maps to provider error code (deploy)', async () => {
  const fake = async () => new Response(JSON.stringify({ message:'nope' }), { status:403 });
  await assert.rejects(() => postDeploy({ provider:'vercel', repo:'x', framework:'y', fetchImpl:fake }));
});
