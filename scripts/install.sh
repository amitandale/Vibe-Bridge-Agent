#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$here"

need_node_major=20
node_major=$(node -p "process.versions.node.split('.')[0]" || echo 0)
if [[ "$node_major" -lt "$need_node_major" ]]; then
  echo "Node $need_node_major.x required. Found $(node -v || true)"
  exit 1
fi

umask 077
mkdir -p ./data

provider="${CONTEXT_PROVIDER:-fs}"

if [[ "$provider" == "llamaindex" ]]; then
  echo "[install] CONTEXT_PROVIDER=llamaindex -> ensuring llamaindex is available"
  # Use npm install to allow adding runtime dep without lockfile churn.
  npm install --no-audit --no-fund llamaindex@latest
else
  echo "[install] CONTEXT_PROVIDER=$provider -> skipping llamaindex install"
fi

echo "[install] installing production deps"
# Use npm ci if lockfile matches, else fall back to npm install
if npm ci --omit=dev; then
  echo "[install] npm ci done"
else
  echo "[install] npm ci failed, falling back to npm install"
  npm install --omit=dev --no-audit --no-fund
fi

if [[ -f scripts/db/migrate.mjs ]]; then
  echo "[install] running DB migrations"
  node scripts/db/migrate.mjs || true
fi

echo "[install] done"
