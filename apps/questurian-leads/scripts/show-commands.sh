#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
Available commands

Repo root:
  bun install
  bun run dev
  bun run build
  bun run lint
  bun run docker:start
  bun run docker:stop
  bun run docker:logs
  bun run docker:restart

API (apps/api):
  python3 -m venv .venv && source .venv/bin/activate
  pip install -r apps/api/requirements.txt
  cd apps/api && python3 -m uvicorn app.main:app --reload

Client (apps/client):
  cd apps/client && bun run dev
  cd apps/client && bun run build
  cd apps/client && bun run preview

Env flags:
  RUN_MIGRATIONS=1
EOF
