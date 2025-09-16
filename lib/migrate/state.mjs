// lib/migrate/state.mjs
// Simple in-memory migration state for tests
let didRun = false;
let applied = 0;
let pending = 0;
let lastApplied = null;

export function __reset(){ didRun=false; applied=0; pending=0; lastApplied=null; }

export async function ensureMigrations(){ 
  if (didRun) return;
  if (process.env.DATABASE_URL) {
    didRun = true;
    applied = 1;
    pending = 0;
    lastApplied = new Date(1756318252799).toISOString();
  } else {
    didRun = true;
    applied = 0;
    pending = 0;
    lastApplied = null;
  }
}

export function status(){ 
  return { didRun, applied, pending, lastApplied }; 
}
