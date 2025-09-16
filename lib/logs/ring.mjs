// Bridge-Agent: fixed-size ring buffer for log events per channel
export function makeRing({ maxEvents = 1000, maxBytes = 1024 * 1024 } = {}) {
  let buf = [];
  let size = 0;
  let seq = 0;
  function evByteLen(e){ try { return JSON.stringify(e).length; } catch { return 0; } }
  function append(evt) {
    const withSeq = { ...evt, seq: ++seq };
    const bytes = evByteLen(withSeq);
    buf.push(withSeq);
    size += bytes;
    while (buf.length > maxEvents || size > maxBytes) {
      const removed = buf.shift();
      size -= evByteLen(removed);
    }
    return withSeq;
  }
  function since(cursor) {
    if (!cursor) return buf.slice(-100); // default tail
    const c = Number(cursor);
    if (!Number.isFinite(c)) return buf.slice(-100);
    return buf.filter(e => e.seq > c);
  }
  return { append, since, lastSeq: () => (buf.length ? buf[buf.length-1].seq : 0) };
}
