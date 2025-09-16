// Bridge-Agent: SSE stream for logs with replay + tail
import { replay, subscribe, lastSeq } from '../../../../../../lib/logs/bus.mjs';
function encode(event, data){
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
export async function GET(req, { params }){
  const { type, id } = params || {};
  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const heartbeatMs = 10000;
  let stop = () => {};
  let alive = true;

  function send(e){ return writer.write(new TextEncoder().encode(e)); }

  // Replay
  const replayEvents = replay({ type, id }, cursor);
  for (const e of replayEvents) {
    await send(encode('log', e));
  }
  await send(encode('cursor', { seq: lastSeq({ type, id }) }));

  // Tail
  const unsub = subscribe({ type, id })((e) => {
    if (!alive) return;
    send(encode('log', e)).catch(()=>{});
  });
  stop = () => { alive = false; unsub(); writer.close().catch(()=>{}); };

  // Heartbeat
  const timer = setInterval(() => { if (alive) send(`:keepalive\n\n`).catch(()=>{}); }, heartbeatMs);
  timer.unref?.();

  // Close on client abort
  req.signal?.addEventListener?.('abort', () => { clearInterval(timer); stop(); });

  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive'
    }
  });
}
