// lib/llm/util/stream.mjs
// Assemble SSE or JSONL text into { delta, done } events.

export function* parseSse(text){
  const events = text.split(/\n\n+/);
  for (const e of events){
    const lines = e.split(/\n/).map(s => s.replace(/^data:\s?/, '')).filter(Boolean);
    for (const line of lines){
      if (line === '[DONE]') { yield { done:true }; continue; }
      try {
        const obj = JSON.parse(line);
        const d = obj.delta || obj.choices?.[0]?.delta || obj.choices?.[0]?.message || obj;
        if (typeof d?.content === 'string') {
          yield { delta: d.content };
        }
      } catch {}
    }
  }
}

export function* parseJsonl(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of lines){
    if (line === '[DONE]') { yield { done:true }; continue; }
    try {
      const obj = JSON.parse(line);
      const d = obj.delta || obj.choices?.[0]?.delta || obj;
      if (typeof d?.content === 'string'){
        yield { delta: d.content };
      }
    } catch {}
  }
}
