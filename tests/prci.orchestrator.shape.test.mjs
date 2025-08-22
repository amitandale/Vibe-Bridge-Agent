// tests/prci.orchestrator.shape.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPrCi } from '../lib/gh/prCiOrchestrator.mjs';
import * as providers from '../lib/providers/router.mjs';

test('success path returns ok:true with previewUrl when provider available', async () => {
  const gh = {
    async openOrUpdatePr(){ return { number: 7 }; },
    async prUrl(){ return 'https://github.com/owner/repo/pull/7'; },
    async listChecks(){
      return [
        { name:'build', status:'completed', conclusion:'success' },
        { name:'tests', status:'completed', conclusion:'success' },
      ];
    },
    async previewId(){ return 'deploy_123'; }
  };
  const fake = async (url) => {
    if (url.includes('/preview')) return new Response(JSON.stringify({ url:'https://preview.app' }), { status:200 });
    return new Response('{}', { status:200 });
  };
  const out = await runPrCi({ repo:'o/r', branch:'feat/x', provider:'vercel', gh, providers, fetchImpl:fake, maxAttempts:1 });
  assert.equal(out.ok, true);
  assert.equal(out.previewUrl, 'https://preview.app');
  assert.match(out.prUrl, /pull\/7/);
});

test('failure path returns concise failures[]', async () => {
  const gh = {
    async openOrUpdatePr(){ return { number: 8 }; },
    async prUrl(){ return 'https://github.com/owner/repo/pull/8'; },
    async listChecks(){
      return [
        { name:'build', status:'completed', conclusion:'success' },
        { name:'tests', status:'completed', conclusion:'failure', summary:'1 failing test' },
      ];
    }
  };
  const out = await runPrCi({ repo:'o/r', branch:'bug/y', gh, maxAttempts:1 });
  assert.equal(out.ok, false);
  assert.equal(out.failures.length, 1);
  assert.equal(out.failures[0].name, 'tests');
  assert.equal(out.failures[0].conclusion, 'failure');
});

test('timeout produces a timed_out failure', async () => {
  let calls = 0;
  const gh = {
    async openOrUpdatePr(){ return { number: 9 }; },
    async prUrl(){ return 'https://github.com/owner/repo/pull/9'; },
    async listChecks(){ calls++; return [{ name:'build', status:'queued' }]; }
  };
  const out = await runPrCi({ repo:'o/r', branch:'slow/z', gh, maxAttempts:2, intervalMs:10 });
  assert.equal(out.ok, false);
  assert.equal(out.failures[0].name, 'timeout');
});
