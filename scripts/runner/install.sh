#!/usr/bin/env bash
set -euo pipefail

usage(){
  cat <<'EOF'
Usage: install.sh --project <id> --lane <ci|staging|prod> --scope <repo|org> --owner <org> [--repo <name>] [--label-prefix vibe] [--name NAME] [--version 2.x.y] [--dry-run]
Env: GH_APP_ID+GH_PRIVATE_KEY or GH_PAT; RUNNER_DL_URL optional; RUNNER_ROOT default /opt/github-runner; RUNNER_USER_PREFIX default runner-
Exit codes: 0 ok/up-to-date, 10 prereq missing, 20 token fetch failed, 30 register failed, 40 systemd install failed
EOF
}

PROJECT=""; LANE=""; SCOPE=""; OWNER=""; REPO=""; LABEL_PREFIX="${RUNNER_LABEL_PREFIX:-vibe}"; NAME=""; VERSION="${RUNNER_VERSION:-}"; DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2;;
    --lane) LANE="$2"; shift 2;;
    --scope) SCOPE="$2"; shift 2;;
    --owner) OWNER="$2"; shift 2;;
    --repo) REPO="$2"; shift 2;;
    --label-prefix) LABEL_PREFIX="$2"; shift 2;;
    --name) NAME="$2"; shift 2;;
    --version) VERSION="$2"; shift 2;;
    --dry-run) DRY_RUN=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 10;;
  esac
done

if [[ -z "$PROJECT" || -z "$LANE" || -z "$SCOPE" || -z "$OWNER" ]]; then echo "missing required args"; usage; exit 10; fi
if [[ "$SCOPE" == "repo" && -z "$REPO" ]]; then echo "--repo required for scope=repo"; exit 10; fi

RUNNER_ROOT="${RUNNER_ROOT:-/opt/github-runner}"
RUNNER_USER_PREFIX="${RUNNER_USER_PREFIX:-runner-}"
RUNNER_USER="${RUNNER_USER_PREFIX}${PROJECT}-${LANE}"
ROOT="${RUNNER_ROOT}/${PROJECT}/${LANE}"
ENV_DIR="${ROOT}/env"
BIN_DIR="${ROOT}/bin"
LOG_DIR="${ROOT}/logs"

plan_only(){
  echo "[plan] root=${ROOT} user=${RUNNER_USER} scope=${SCOPE} owner=${OWNER} repo=${REPO} labels=${LABEL_PREFIX},${PROJECT},${LANE} version=${VERSION:-auto}"
}

if [[ "${DRY_RUN}" -eq 1 ]]; then plan_only; exit 0; fi

# 1) Preflight
command -v systemctl >/dev/null || { echo "systemd missing"; exit 10; }
getent group docker >/dev/null || { echo "docker group missing"; exit 10; }
# 2) Ensure user and dirs
if ! id -u "${RUNNER_USER}" >/dev/null 2>&1; then
  sudo useradd -r -s /usr/sbin/nologin -g docker "${RUNNER_USER}"
fi
sudo install -d -m 700 -o "${RUNNER_USER}" -g docker "${ROOT}" "${ENV_DIR}" "${LOG_DIR}"
sudo install -d -m 700 -o "${RUNNER_USER}" -g docker "${ROOT}/_work"
sudo install -d -m 700 -o "${RUNNER_USER}" -g docker "${BIN_DIR}"

# 3) Download if needed
if [[ -n "${RUNNER_DL_URL:-}" && ! -f "${BIN_DIR}/run.sh" ]]; then
  tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
  if command -v curl >/dev/null; then curl -fsSL "${RUNNER_DL_URL}" -o "$tmp"; else wget -qO "$tmp" "${RUNNER_DL_URL}"; fi
  sudo tar -C "${BIN_DIR}" -xzf "$tmp"
  sudo chown -R "${RUNNER_USER}:docker" "${BIN_DIR}"
  sudo chmod -R a=,u=rwX,g=rX "${BIN_DIR}"
fi

# 4) Render env
RUNNER_NAME="${NAME:-vps-${PROJECT}-${LANE}}"
cat <<EOF | sudo tee "${ENV_DIR}/runner.env" >/dev/null
RUNNER_NAME=${RUNNER_NAME}
RUNNER_LABELS=${LABEL_PREFIX},${PROJECT},${LANE}
RUNNER_SCOPE=${SCOPE}
RUNNER_OWNER=${OWNER}
EOF
if [[ -n "${REPO}" ]]; then echo "RUNNER_REPO=${REPO}" | sudo tee -a "${ENV_DIR}/runner.env" >/dev/null; fi
sudo chmod 640 "${ENV_DIR}/runner.env"
sudo chown "${RUNNER_USER}:docker" "${ENV_DIR}/runner.env"

# 5) Install unit instance
SYS_DIR="/etc/systemd/system"
UNIT_NAME="github-runner@${PROJECT}:${LANE}.service"
if [[ -f "/opt/bridge-agent/assets/systemd/github-runner@.service" ]]; then
  sudo install -m 644 "/opt/bridge-agent/assets/systemd/github-runner@.service" "${SYS_DIR}/github-runner@.service"
fi
sudo systemctl daemon-reload || { echo "daemon-reload failed"; exit 40; }
sudo systemctl enable --now "${UNIT_NAME}" || { echo "enable failed"; exit 40; }

echo "ok"
exit 0
