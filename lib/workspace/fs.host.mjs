// lib/workspace/fs.host.mjs
// BigInt-safe filesystem stats via `stat -f` parsing.
/** Parse `stat -f` output */
export function parseStatFS(text){
  const s = String(text||'');
  // Try concise printf output first: "%S %b %f"
  const conc = s.trim().split(/\s+/);
  if (conc.length === 3 && conc.every(x => /^\d+$/.test(x))){
    const bs = BigInt(conc[0]), btot = BigInt(conc[1]), bfree = BigInt(conc[2]);
    return { blockSize: bs, blocksTotal: btot, blocksFree: bfree, bytesFree: bs * bfree, bytesTotal: bs * btot };
  }
  // Fallback to human format
  const bs = (s.match(/Block size:\s*(\d+)/) || [,'4096'])[1];
  const total = (s.match(/Blocks:\s*Total:\s*(\d+)/) || [,'0'])[1];
  const free = (s.match(/Blocks:\s*.*?Free:\s*(\d+)/) || [,'0'])[1];
  const bsBI = BigInt(bs), totBI = BigInt(total), freeBI = BigInt(free);
  return { blockSize: bsBI, blocksTotal: totBI, blocksFree: freeBI, bytesFree: bsBI * freeBI, bytesTotal: bsBI * totBI };
}

/** Execute `stat -f` and return BigInt-safe numbers. exec: (cmd,args)=>Promise<string> */
export async function statFS({ mount='/', exec } = {}){
  const out = await (exec ? exec('stat',['-f',mount]) : Promise.resolve(''));
  return parseStatFS(out);
}
