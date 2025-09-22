# Orchestrator deploy

- Runs on self-hosted runner on VPS.
- Uses systemd `vibe-orchestrator` unit.
- Env file: `/etc/vibe/orchestrator.env` written from GitHub Environment secrets/vars.
- Stop → rsync → start. Leaves service running for manual checks.
