#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
STAMP_FILE="$ROOT_DIR/.venv/.requirements.sha256"

requirements_hash() {
  cd "$ROOT_DIR"
  python3 - <<'PY'
from pathlib import Path
import hashlib

files = [
    Path("apps/backend/requirements.txt"),
    Path("apps/backend/requirements-dev.txt"),
]

digest = hashlib.sha256()
for path in files:
    digest.update(path.name.encode("utf-8"))
    digest.update(b"\0")
    digest.update(path.read_bytes())
    digest.update(b"\0")

print(digest.hexdigest())
PY
}

missing_runtime_dependency() {
  "$ROOT_DIR/.venv/bin/python" - <<'PY' >/dev/null 2>&1
required_modules = ("fastapi", "uvicorn", "langgraph")
for module_name in required_modules:
    __import__(module_name)
PY
}

cd "$ROOT_DIR"
CURRENT_HASH=$(requirements_hash)
NEEDS_INSTALL=0

if [ ! -x .venv/bin/python ]; then
  NEEDS_INSTALL=1
fi

if [ "$NEEDS_INSTALL" -eq 0 ]; then
  if [ ! -f "$STAMP_FILE" ] || [ "$(cat "$STAMP_FILE")" != "$CURRENT_HASH" ]; then
    NEEDS_INSTALL=1
  fi
fi

if [ "$NEEDS_INSTALL" -eq 0 ] && ! missing_runtime_dependency; then
  NEEDS_INSTALL=1
fi

if [ "$NEEDS_INSTALL" -eq 1 ]; then
  pnpm run python:deps
  printf '%s\n' "$CURRENT_HASH" > "$STAMP_FILE"
fi
