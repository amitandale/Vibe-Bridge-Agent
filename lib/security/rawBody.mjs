// Raw body reader for plain Node/Connect-like handlers.
// Returns Buffer of raw body. Non-mutating.
export async function readRawBody(req) {
  // If body already buffered by framework, use it.
  if (req.body && Buffer.isBuffer(req.body)) return req.body;
  if (req.rawBody && Buffer.isBuffer(req.rawBody)) return req.rawBody;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}
