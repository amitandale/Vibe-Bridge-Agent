// lib/llm/types.mjs

/** @typedef {{ role:'system'|'user'|'assistant'|'tool', content:string, tool_call_id?:string, name?:string }} Message */
/** @typedef {{ id:string, name:string, arguments:string }} ToolCall */
/** @typedef {{ inputTokens:number, outputTokens:number }} Usage */
/** @typedef {{ text:string, tool_calls?:ToolCall[], usage:Usage, finish:string }} ChatResult */

export const LLM_DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 10000);

/** Basic shape guards */
export function asMessages(x){
  if (!Array.isArray(x)) return [];
  return x.map(m => ({
    role: m.role,
    content: String(m.content ?? ''),
    tool_call_id: m.tool_call_id ?? undefined,
    name: m.name ?? undefined
  }));
}
