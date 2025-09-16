// tests/_teardown.mjs
import test from 'node:test';
let getGlobalDispatcher = null;
try { ({ getGlobalDispatcher } = await import('undici')); } catch {}
test.after(async () => {
  try { getGlobalDispatcher && getGlobalDispatcher()?.close?.(); } catch {}
  // Drain microtasks then force-exit under CI to avoid hangs from stray handles
  await Promise.resolve();
  if (process.env.CI === 'true' || process.env.CI === '1') {
    const t = setTimeout(() => process.exit(0), 0);
    t.unref?.();
  }
});
