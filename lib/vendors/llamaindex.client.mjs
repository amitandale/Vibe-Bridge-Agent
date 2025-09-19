// Standalone LlamaIndex client with optional HMAC signing and injectable fetch.
export function makeLlamaIndexClient(opts = {}) {
  const baseUrl = (opts.baseUrl ?? process.env.LLAMAINDEX_URL ?? "http://localhost").toString();
  const apiKey = opts.apiKey ?? process.env.LLAMAINDEX_API_KEY ?? "";
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("NO_FETCH");

  const kid = opts.kid ?? process.env.LI_HMAC_KID ?? process.env.BOOTSTRAP_HMAC_KID ?? "";
  const key = opts.key ?? process.env.LI_HMAC_KEY ?? process.env.BOOTSTRAP_HMAC_KEY ?? "";

  function makeHeaders(extra = {}) {
    const h = { "content-type": "application/json", ...extra };
    if (apiKey) h["authorization"] = `Bearer ${apiKey}`;
    if (kid && extra.__addSigningHeaders) {
      // strip marker
      delete h.__addSigningHeaders;
      h["x-vibe-kid"] = kid;
    }
    return h;
  }

  async function hmacSha256Hex(secret, bodyStr) {
    if (!secret) return null;
    try {
      const { createHmac } = await import('node:crypto');
      const hex = createHmac('sha256', secret).update(Buffer.from(bodyStr)).digest('hex');
      return hex;
    } catch {
      if (globalThis.crypto?.subtle) {
        const enc = new TextEncoder();
        const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', k, enc.encode(bodyStr));
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
      }
      return null;
    }
  }

  async function doPost(path, payload, projectId, addIdemKey) {
    const url = new URL(path, baseUrl).toString();
    const body = JSON.stringify(payload);
    const headers = makeHeaders({
      "x-vibe-project": projectId || "",
      ...(addIdemKey && payload?.idempotencyKey ? { "idempotency-key": payload.idempotencyKey } : {}),
      __addSigningHeaders: !!key,
    });
    if (key) {
      const hex = await hmacSha256Hex(key, body);
      if (hex) headers["x-signature"] = `sha256=${hex}`;
    }
    const res = await fetchImpl(url, { method: "POST", headers, body });
    return res;
  }

  function toInt(n, dflt) {
    const v = Number.parseInt(n, 10);
    return Number.isFinite(v) && v > 0 ? v : dflt;
  }

  async function upsert({ projectId, docs, idempotencyKey } = {}) {
    const payload = { projectId, docs, idempotencyKey };
    const res = await doPost("/index/upsert", payload, projectId, true);
    return { ok: !!res?.ok, status: res?.status ?? 0 };
  }

  async function query({ projectId, q, topK } = {}) {
    const resolvedTopK = toInt(topK ?? process.env.LI_TOP_K, 5);
    const payload = { projectId, q, top_k: resolvedTopK };
    const res = await doPost("/query", payload, projectId, false);
    const raw = typeof res?.json === "function" ? await res.json() : undefined;

    const source =
      (Array.isArray(raw?.results) && raw.results) ||
      (Array.isArray(raw?.chunks) && raw.chunks) ||
      (Array.isArray(raw?.data) && raw.data) ||
      [];

    const items = [];
    for (const r of source) {
      if (!r) continue;
      const text = r.text ?? r.content ?? r.chunk ?? r.page_content ?? "";
      const score = r.score ?? r.similarity ?? r.relevance ?? undefined;
      const id = r.id ?? r.doc_id ?? r.node_id ?? undefined;
      const metadata = r.metadata ?? r.meta ?? undefined;
      items.push({ text, ...(score !== undefined ? { score } : {}), ...(id !== undefined ? { id } : {}), ...(metadata !== undefined ? { metadata } : {}), });
    }
    const chunks = items.map(x => ({ ...x }));
    return { items, chunks, results: chunks, raw, top_k: resolvedTopK };
  }

  return { upsert, query };
}
