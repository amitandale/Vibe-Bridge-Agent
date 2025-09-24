#!/usr/bin/env bash
set -euo pipefail
ENV_FILE="${ENV_FILE:-/etc/vibe/bridge-agent.env}"
if [[ -f "$ENV_FILE" ]]; then set -a; . "$ENV_FILE"; set +a; fi
PORT="${PORT:-3002}"
URL="http://127.0.0.1:${PORT}/api/health"
echo "Probing ${URL}"
curl -fsSIL "$URL" >/dev/null && echo "OK" || { echo "Health probe failed" >&2; exit 1; }
