export function sleep(ms, { setTimeoutImpl = setTimeout } = {}) {
  return new Promise(res => setTimeoutImpl(res, ms));
}
