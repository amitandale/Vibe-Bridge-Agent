// lib/keystore/local.mjs
import { randomBytes, scrypt as _scrypt, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

const scrypt = promisify(_scrypt);

function basePath(){
  return path.join(homedir(), '.vibe');
}
function filePath(){
  return path.join(basePath(), 'llm.keys.json.enc');
}

async function ensureDir(){
  await mkdir(basePath(), { recursive: true });
}

function getPassphrase(){
  const pass = process.env.VIBE_KEYSTORE_PASS;
  const prod = process.env.NODE_ENV === 'production';
  if (!pass && prod) throw new Error('VIBE_KEYSTORE_PASS required in production');
  return pass || 'dev-pass-only';
}

async function deriveKey(pass, salt){
  const key = await scrypt(pass, salt, 32);
  return key;
}

async function encryptJson(obj){
  const pass = getPassphrase();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(pass, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('v1'), salt, iv, tag, encrypted]).toString('base64');
}

async function decryptJson(blob){
  const buf = Buffer.from(blob, 'base64');
  const ver = buf.subarray(0,2).toString();
  if (ver !== 'v1') throw new Error('BAD_VERSION');
  const salt = buf.subarray(2, 18);
  const iv = buf.subarray(18, 30);
  const tag = buf.subarray(30, 46);
  const data = buf.subarray(46);
  const pass = getPassphrase();
  const key = await deriveKey(pass, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function readMap(){
  try {
    const raw = await readFile(filePath(), 'utf8');
    return await decryptJson(raw);
  } catch { return {}; }
}

async function writeMap(map){
  await ensureDir();
  const enc = await encryptJson(map);
  await writeFile(filePath(), enc, 'utf8');
}

/** Save API key and optional baseUrl */
export async function setKey(provider, apiKey, baseUrl){
  if (!provider || !apiKey) throw new Error('INVALID_INPUT');
  const m = await readMap();
  m[provider] = { apiKey, ...(baseUrl ? { baseUrl } : {}) };
  await writeMap(m);
  return true;
}

/** Get key record or null */
export async function getKey(provider){
  const m = await readMap();
  return m[provider] || null;
}

/** Re-encrypt with a new passphrase. Provide new via env before calling. */
export async function rotate(){
  const m = await readMap();
  await writeMap(m);
  return true;
}
