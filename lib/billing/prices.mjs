// lib/billing/prices.mjs
// Runtime prices with code defaults and optional override at ~/.vibe/billing/prices.json
import { readFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** @typedef {{provider:string, model:string, inputPer1KUsd:number, outputPer1KUsd:number}} PriceRow */

const DEFAULTS = /** @type {PriceRow[]} */([
  // Perplexity
  { provider:'perplexity', model:'pplx-70b-chat', inputPer1KUsd:1.0, outputPer1KUsd:1.0 },
  { provider:'perplexity', model:'pplx-7b-chat',  inputPer1KUsd:0.2, outputPer1KUsd:0.2 },
  // Anthropic
  { provider:'anthropic',  model:'claude-3.5-sonnet', inputPer1KUsd:3.0, outputPer1KUsd:15.0 },
  { provider:'anthropic',  model:'claude-3.5-haiku',  inputPer1KUsd:0.8, outputPer1KUsd:4.0 },
  // OpenAI
  { provider:'openai',     model:'gpt-4o',        inputPer1KUsd:5.0,  outputPer1KUsd:15.0 },
  { provider:'openai',     model:'gpt-4o-mini',   inputPer1KUsd:0.5,  outputPer1KUsd:1.5 },
  // Grok
  { provider:'grok',       model:'grok-2',        inputPer1KUsd:5.0,  outputPer1KUsd:15.0 }
]);

function getOverridePath(){
  const home = homedir();
  return path.join(home, '.vibe', 'billing', 'prices.json');
}

/** @returns {Promise<PriceRow[]>} */
export async function loadPrices(){
  // Merge defaults with optional override. Override wins by (provider,model)
  const map = new Map(DEFAULTS.map(r => [`${r.provider}:${r.model}`, r]));
  const p = getOverridePath();
  try {
    await access(p, fsConstants.R_OK);
    const raw = await readFile(p, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)){
      for (const row of arr){
        if (!row || typeof row !== 'object') continue;
        const { provider, model, inputPer1KUsd, outputPer1KUsd } = row;
        if (!provider || !model) continue;
        const inN  = Number(inputPer1KUsd);
        const outN = outputPer1KUsd == null ? inN : Number(outputPer1KUsd);
        if (!(inN >= 0) || !(outN >= 0)) continue;
        map.set(`${provider}:${model}`, { provider, model, inputPer1KUsd: inN, outputPer1KUsd: outN });
      }
    }
  } catch {}
  return Array.from(map.values());
}

/** @param {{provider:string, model:string}} q */
export async function getPrice(q){
  const list = await loadPrices();
  return list.find(p => p.provider === q.provider && p.model === q.model) || null;
}

/** Convenience for routes */
export function listPricesSyncDefaultsOnly(){
  return DEFAULTS.slice();
}

/** For routes that do not want to await */
export function listPrices(){
  return DEFAULTS.slice();
}
