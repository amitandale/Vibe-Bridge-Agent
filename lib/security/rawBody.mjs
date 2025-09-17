// lib/security/rawBody.mjs
// Read raw body bytes without mutation. For Next.js API routes.
import { Buffer } from 'node:buffer';

/**
 * Reads and returns raw request body as Buffer.
 * If content-length is 0 or missing body, returns empty Buffer.
 * The request is not consumed for downstream JSON parsing when using Next.js
 * since we use request.clone() where available.
 *
 * @param {Request|IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
export async function readRawBody(req){
  if (!req) return Buffer.alloc(0);
  // Web Fetch Request
  if (typeof req.arrayBuffer === 'function'){
    try {
      const ab = await req.arrayBuffer();
      return Buffer.from(ab);
    } catch {
      return Buffer.alloc(0);
    }
  }
  // Node IncomingMessage
  return await new Promise((resolve) => {
    const chunks = [];
    try {
      req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', () => resolve(Buffer.alloc(0)));
    } catch {
      resolve(Buffer.alloc(0));
    }
  });
}
