// lib/workspace/sys.host.mjs
import os from 'node:os';
import fs from 'node:fs/promises';

/** Read /proc/meminfo MemAvailable kB; fallback to os.totalmem/os.freemem */
export async function memFreeMB({ readFile=fs.readFile } = {}){
  try {
    const txt = await readFile('/proc/meminfo', 'utf8');
    const m = txt.match(/^MemAvailable:\s*(\d+) kB/m);
    if (m) return Math.floor(parseInt(m[1], 10) / 1024);
  } catch {}
  return Math.floor(os.freemem() / (1024*1024));
}

export async function nproc({ env = process.env } = {}){
  const v = Number(env.NPROC || env.nproc || 0);
  if (v > 0) return v;
  const cpus = os.cpus();
  return (cpus && cpus.length) ? cpus.length : 1;
}

export async function loadAvg1(){
  const arr = os.loadavg?.() || [0,0,0];
  return Number(arr[0] || 0);
}

export async function uptimeS({ readFile=fs.readFile } = {}){
  try {
    const txt = await readFile('/proc/uptime', 'utf8');
    const f = parseFloat(txt.split(/\s+/)[0] || '0');
    return Math.floor(isFinite(f) ? f : 0);
  } catch {
    return Math.floor(os.uptime?.() || 0);
  }
}
