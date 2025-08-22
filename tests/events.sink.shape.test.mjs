// tests/events.sink.shape.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendEvents } from '../lib/events/sink.mjs';

test('appendEvents posts to vibe-ui /api/runs/events', async () => {
  process.env.VIBE_UI_BASE_URL = 'https://ui.local';
  let called = 0, captured = null;
  global.fetch = async (url, init) => {
    called++; captured = { url, init };
    return new Response(JSON.stringify({ ok:true, appended:2 }), { status:200 });
  };
  const out = await appendEvents({ projectId:'p1', runId:'r1', events:[{t:'x'},{t:'y'}] });
  assert.equal(out.ok, true);
  assert.equal(out.appended, 2);
  assert.ok(captured.url.endsWith('/api/runs/events'));
  const body = JSON.parse(captured.init.body);
  assert.equal(body.events.length, 2);
});
