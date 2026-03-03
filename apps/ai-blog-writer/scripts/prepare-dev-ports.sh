#!/usr/bin/env sh
set -eu

PORTS="${1:-4010 4003 3003}"

# Kill common stale ABW processes owned by current user.
pkill -f "uvicorn app.main:app --reload --host 0.0.0.0 --port 4003" 2>/dev/null || true
pkill -f "tsx watch src/index.ts" 2>/dev/null || true

for port in $PORTS; do
  lsof -ti :"$port" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
done

busy_ports=""
for port in $PORTS; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    busy_ports="$busy_ports $port"
  fi
done

if [ -n "$busy_ports" ]; then
  echo "Error: required dev ports are still in use:$busy_ports"
  echo "Possible stale owners:"
  ps -ef | grep -E "uvicorn app.main:app --reload --host 0.0.0.0 --port 4003|tsx watch src/index.ts" | grep -v grep || true
  echo "Check owners with: sudo lsof -nP -iTCP:<port> -sTCP:LISTEN"
  echo "Then stop them with: sudo kill -9 <pid>"
  exit 1
fi
