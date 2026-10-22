#!/usr/bin/env bash
# Fail on missing variables, failed commands and failed pipeline stages. Never
# start the API after a failed install/build, which could serve a stale frontend.
set -euo pipefail
# Resolve from the script's location so invoking it from another directory works.
cd "$(dirname "$0")/.."
# Reuse an isolated Python environment; Node's lockfile is enforced by npm ci.
if [[ ! -x .venv/bin/python ]]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install -r backend/requirements.txt
(cd frontend && npm ci && npm run build)
cd backend
# Idempotent seeding preserves existing employee edits and adds no duplicates.
../.venv/bin/python -m app.seed
# Loopback is intentional: this unauthenticated synthetic demo is not launched
# publicly by a local-development command. exec preserves Ctrl-C/signal behavior.
exec ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8000}"
