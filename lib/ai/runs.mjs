const runs = new Map();
function newId(){ return Math.random().toString(36).slice(2); }

export function createRun({ projectRoot, prompt, roster, ticket }) {
  const id = newId();
  runs.set(id, { id, phase:'QUEUED', step:0, changedFiles:[], errors:null, pr:null });
  return id;
}

export function updateRun(id, patch){
  const cur = runs.get(id);
  if (!cur) return;
  runs.set(id, { ...cur, ...patch });
}

export function getRun(id){
  return runs.get(id) || null;
}
