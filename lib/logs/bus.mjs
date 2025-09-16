// Bridge-Agent: in-memory logs bus with channels
import { makeRing } from './ring.mjs';
const channels = new Map(); // key `${type}:${id}` -> { ring, listeners:Set }
function key(type, id){ return `${type}:${id}`; }
function ensure(type, id){
  const k = key(type, id);
  if (!channels.has(k)) channels.set(k, { ring: makeRing({}), listeners: new Set() });
  return channels.get(k);
}
export function append({ type, id }, evt){
  const ch = ensure(type, id);
  const stamped = ch.ring.append({ ts: Date.now(), level: evt.level || 'info', message: evt.message || '', meta: evt.meta });
  for (const write of ch.listeners) {
    try { write(stamped); } catch {}
  }
  return stamped;
}
export function replay({ type, id }, cursor){
  const ch = ensure(type, id);
  return ch.ring.since(cursor);
}
export function subscribe({ type, id }){
  const ch = ensure(type, id);
  return (onEvent) => {
    ch.listeners.add(onEvent);
    return () => ch.listeners.delete(onEvent);
  };
}
export function lastSeq({ type, id }){
  const ch = ensure(type, id);
  return ch.ring.lastSeq();
}
