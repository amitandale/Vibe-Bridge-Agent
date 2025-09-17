// tests/diag/z_after_all.test.mjs
import test from 'node:test';

// Runs once and installs a process-wide beforeExit hook.
// Prints active handles and closes Undici dispatcher to avoid lingering sockets.
test('diag-after-all', async () => {
  process.on('beforeExit', async () => {
    try {
      const undici = await import('undici');
      if (undici && undici.getGlobalDispatcher) {
        await undici.getGlobalDispatcher().close();
        console.error('# DIAG undici: dispatcher closed');
      }
    } catch (e) {
      console.error('# DIAG undici: close failed', e?.message);
    }
    const handles = (typeof process._getActiveHandles === 'function') ? process._getActiveHandles() : [];
    console.error('# DIAG active handles:', handles.map(h=>h && h.constructor && h.constructor.name || typeof h));
    for (const h of handles) {
      try {
        if (h && typeof h.address === 'function') {
          console.error('# DIAG server address', h.address());
        } else if (h && h.remoteAddress && h.remotePort) {
          console.error('# DIAG socket peer', { host: h.remoteAddress, port: h.remotePort });
        } else if (h && h.hasOwnProperty && h.hasOwnProperty('_repeat')) {
          console.error('# DIAG timer', { repeat: !!h._repeat });
        }
      } catch {}
    }
  });
});
