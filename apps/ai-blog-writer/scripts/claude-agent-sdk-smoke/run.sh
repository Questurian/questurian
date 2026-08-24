#!/usr/bin/env sh
set -eu

# Phase-1 smoke test for the Claude Agent SDK on a Claude subscription.
# Keeps its own virtualenv so the SDK's dependency tree (mcp, starlette,
# uvicorn) never touches the pinned ai-blog-writer backend env.

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname "$0")" && pwd)
REPO_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIR/../../../.." && pwd)
VENV="$SCRIPT_DIR/.venv"

cd "$SCRIPT_DIR"

if command -v uv >/dev/null 2>&1; then
  UV_CACHE_DIR="$REPO_ROOT/.uv-cache" uv venv --python "$(command -v python3)" --allow-existing "$VENV" >/dev/null
  UV_CACHE_DIR="$REPO_ROOT/.uv-cache" uv pip install --python "$VENV/bin/python" -q -r requirements.txt
else
  [ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
  "$VENV/bin/python" -m pip install -q -r requirements.txt
fi

exec "$VENV/bin/python" smoke_test.py
