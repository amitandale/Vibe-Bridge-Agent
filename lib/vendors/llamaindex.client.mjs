/**
 * Self-contained LlamaIndex client with injectable fetch.
 * API:
 *   const client = makeLlamaIndexClient({ baseUrl?, apiKey?, fetchImpl? })
 *   await client.upsert({ projectId, docs, idempotencyKey? })
 *   const out = await client.query({ projectId, q, topK? })
 *     -> returns { items: [{ text, score?, id?, metadata? }], raw }
 */
export function makeLlamaIndexClient(opts = {}) {
  const baseUrl = (opts.baseUrl ?? process.env.LLAMAINDEX_URL ?? "http://localhost").toString();
  const apiKey = opts.apiKey ?? process.env.LLAMAINDEX_API_KEY ?? "";
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("NO_FETCH");

  function makeHeaders(extra = {}) {
    const h = { "content-type": "application/json", ...extra };
    if (apiKey) h["authorization"] = `Bearer ${apiKey}`;
    return h;
  }

  async function upsert({ projectId, docs, idempotencyKey } = {}) {
    const url = new URL("/upsert", baseUrl).toString();
    const body = JSON.stringify({ projectId, docs });
    const headers = makeHeaders({
      "x-vibe-project": projectId || "",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    });
    const res = await fetchImpl(url, { method: "POST", headers, body });
    return { ok: !!res?.ok, status: res?.status ?? 0 };
  }

  function toInt(n, dflt) {
    const v = Number.parseInt(n, 10);
    return Number.isFinite(v) && v > 0 ? v : dflt;
  }

  async function query({ projectId, q, topK } = {}) {
    const resolvedTopK = toInt(topK ?? process.env.LI_TOP_K, 5);
    const url = new URL("/query", baseUrl).toString();
    const payload = { projectId, q, top_k: resolvedTopK };
    const res = await fetchImpl(url, {
      method: "POST",
      headers: makeHeaders({ "x-vibe-project": projectId || "" }),
      body: JSON.stringify(payload),
    });
    const raw = typeof res?.json === "function" ? await res.json() : undefined;

    // Normalize common shapes to [{ text, ... }]
    let items = [];
    const arr =
      Array.isArray(raw?.results) ? raw.results :
      Array.isArray(raw?.chunks) ? raw.chunks :
      Array.isArray(raw?.data) ? raw.data :
      [];

    for (const r of arr) {
      if (!r) continue;
      const text = r.text ?? r.content ?? r.chunk ?? r.page_content ?? "";
      const score = r.score ?? r.similarity ?? r.relevance ?? undefined;
      const id = r.id ?? r.doc_id ?? r.node_id ?? undefined;
      const metadata = r.metadata ?? r.meta ?? undefined;
      items.push({ text, ...(score !== undefined ? { score } : {}), ...(id !== undefined ? { id } : {}), ...(metadata !== undefined ? { metadata } : {}) });
    }
    return { items, raw };
  }

  return { upsert, query };
}
