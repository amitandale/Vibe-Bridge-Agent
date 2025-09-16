// Minimal env helper. If repo already has one, this file will overlay only when missing.
export function env(name, fallback=null){ return process.env[name] ?? fallback; }
