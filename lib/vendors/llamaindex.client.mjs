/**
 * Self-contained LlamaIndex client with injectable fetch.
 * Contract surface:
 *   const client = makeLlamaIndexClient({ baseUrl?, apiKey?, fetchImpl? })
 *   await client.upsert({ projectId, docs, idempotencyKey? })
 */
export function makeLlamaIndexClient(opts = {}) {
  const baseUrl = (opts.baseUrl ?? process.env.LLAMAINDEX_URL ?? "http://localhost").toString();
  const apiKey = opts.apiKey ?? process.env.LLAMAINDEX_API_KEY ?? "";
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("NO_FETCH");
  }

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

  return { upsert };
}
