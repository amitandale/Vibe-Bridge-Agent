// scripts/workspace/dry-run.ci.mjs
import { checkCapacity } from '../../lib/workspace/capacity.mjs';
import { normalizePorts } from '../../lib/workspace/ports.mjs';

const projectId = process.env.PROJECT_ID || 'example';
const lane = process.env.LANE || 'ci';
const desiredPorts = normalizePorts(process.env.PORTS || '');

// Real adapters should be wired by runtime; this CI script is a placeholder that just exits OK.
const res = { ok:true, hint: 'wire real adapters at runtime' };
console.log(JSON.stringify({ projectId, lane, desiredPorts, result: res }, null, 2));
