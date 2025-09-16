#!/usr/bin/env bash
set -euo pipefail

# Defaults
PROJECT=""
DEST_ROOT="/home/devops/projects"
TEMPLATE_FILE=""
TEMPLATE_DIR=""
LANES="ci,staging,prod"
PORTS_JSON=""

usage() {
  echo "Usage: $0 --project <id> [--dest-root <path>] [--template-file <file>|--template-dir <dir>] [--lanes ci,staging,prod] [--ports-json '{\"ci\":{...},...}']" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2;;
    --dest-root) DEST_ROOT="$2"; shift 2;;
    --template-file) TEMPLATE_FILE="$2"; shift 2;;
    --template-dir) TEMPLATE_DIR="$2"; shift 2;;
    --lanes) LANES="$2"; shift 2;;
    --ports-json) PORTS_JSON="$2"; shift 2;;
    -h|--help) usage;;
    *) echo "Unknown arg: $1" >&2; usage;;
  esac
done

[[ -z "$PROJECT" ]] && { echo "MISSING --project"; exit 2; }

# Build ports object
NODE_CODE='
import { renderWorkspace } from "../../lib/workspace/render.mjs";
const env = {};
const [,,project, destRoot, tplFile, tplDir, lanesCSV, portsJSON] = process.argv;
const lanes = (lanesCSV||"ci,staging,prod").split(",").map(s=>s.trim()).filter(Boolean);
let ports;
try {
  ports = portsJSON ? JSON.parse(portsJSON) : undefined;
} catch (e) {
  console.error("Invalid --ports-json:", e.message);
  process.exit(2);
}
renderWorkspace({ projectId: project, destRoot, templateFile: tplFile||undefined, templateDir: tplDir||undefined, lanes, ports, env })
  .then(r => { console.log(JSON.stringify(r)); })
  .catch(e => { console.error(e.code||"ERR", e.message); process.exit(1); });
'
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node -e "$NODE_CODE" "$PROJECT" "$DEST_ROOT" "$TEMPLATE_FILE" "$TEMPLATE_DIR" "$LANES" "$PORTS_JSON"
