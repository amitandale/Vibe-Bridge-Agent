export function toHttpStatus(tagOrCode, err) {
  if (typeof tagOrCode === 'number') return tagOrCode;
  const tag = String(tagOrCode || err?.code || err?.name || '').toUpperCase();
  switch (tag) {
    case 'UNAUTHENTICATED': return 401;
    case 'FORBIDDEN': return 403;
    case 'INVALID_ARGUMENT': return 400;
    case 'BAD_REQUEST': return 400;
    case 'NOT_FOUND': return 404;
    case 'TIMEOUT': return 504;
    case 'UPSTREAM_UNAVAILABLE': return 502;
    default: return 500;
  }
}
