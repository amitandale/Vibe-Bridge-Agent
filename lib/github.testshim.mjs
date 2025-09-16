
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function load(){
  const abs = resolve(__dirname, './github.js');
  const src = await readFile(abs, 'utf8');
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64');
  return await import(dataUrl);
}

const mod = await load();
export const appClient = mod.appClient;
export const installationClient = mod.installationClient;
export const ensureBranch = mod.ensureBranch;
export const getFile = mod.getFile;
export const putFile = mod.putFile;
export const deleteFile = mod.deleteFile;
export const openPR = mod.openPR;
