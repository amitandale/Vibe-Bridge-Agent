#!/usr/bin/env bash
set -euo pipefail
# scripts/workspace/check.sh --project <id> --lane <lane> --ports 123,456
project=""; lane=""; ports=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) project="$2"; shift 2;;
    --lane) lane="$2"; shift 2;;
    --ports) ports="$2"; shift 2;;
    *) echo "Unknown arg: $1" >&2; exit 2;;
  esac
done
node -e "import('./lib/workspace/ports.mjs').then(async P => {
  const desiredPorts = P.normalizePorts('${ports}');
  const res = { ok:false, code:'E_UNKNOWN', hint:'CLI runs only with a real adapter; wire it in agent code' };
  console.log(JSON.stringify({ project: '${project}', lane: '${lane}', desiredPorts, result: res }, null, 2));
})"
