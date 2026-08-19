#!/usr/bin/env bash
# Tests for wait-for-postgres.sh -- the pre-start gate on questura-server.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT="$SCRIPT_DIR/host/wait-for-postgres.sh"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

# A listener the script should find immediately. Any free port will do; the
# script only ever opens a TCP connection and closes it.
listener_port=''
listener_pid=''
start_listener() {
  listener_port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
  python3 -c "
import socket, sys, time
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('127.0.0.1', $listener_port))
s.listen(16)
time.sleep(30)
" &
  listener_pid=$!
  # Give the listener a moment to bind before anything connects.
  for _ in $(seq 1 50); do
    if (exec 3<>"/dev/tcp/127.0.0.1/$listener_port") 2>/dev/null; then
      exec 3>&- 2>/dev/null || true
      return 0
    fi
    sleep 0.1
  done
  fail "test listener never came up"
}

cleanup() {
  [[ -n $listener_pid ]] && kill "$listener_pid" 2>/dev/null || true
}
trap cleanup EXIT

# --- succeeds against a listening port -------------------------------------
start_listener
DATABASE_URI="postgres://user:pw@127.0.0.1:$listener_port/questura" \
  bash "$SCRIPT" >/dev/null 2>&1 ||
  fail "should exit 0 when the port is already accepting connections"

# --- a query string must not be read as part of the port -------------------
DATABASE_URI="postgres://user:pw@127.0.0.1:$listener_port/questura?sslmode=disable" \
  bash "$SCRIPT" >/dev/null 2>&1 ||
  fail "should tolerate query parameters on the URI"

# --- gives up rather than hanging forever ----------------------------------
closed_port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
start=$(date +%s)
if DATABASE_URI="postgres://user:pw@127.0.0.1:$closed_port/questura" \
  QUESTURA_PG_WAIT_TIMEOUT=2 bash "$SCRIPT" >/dev/null 2>&1; then
  fail "should exit non-zero when nothing ever listens"
fi
elapsed=$(( $(date +%s) - start ))
(( elapsed < 15 )) || fail "timeout was not honoured (took ${elapsed}s)"

# --- an unreadable URI must fail loudly, not connect to nothing ------------
# The failure mode this guards is a blank host silently becoming a successful
# no-op, which would restore exactly the race the script exists to remove.
if DATABASE_URI="" QUESTURA_PG_WAIT_TIMEOUT=2 bash "$SCRIPT" >/dev/null 2>&1; then
  fail "should exit non-zero when DATABASE_URI is empty"
fi

if DATABASE_URI="postgres://user:pw@127.0.0.1:not-a-port/questura" \
  QUESTURA_PG_WAIT_TIMEOUT=2 bash "$SCRIPT" >/dev/null 2>&1; then
  fail "should exit non-zero when the port is not numeric"
fi

# --- the unit actually calls it --------------------------------------------
# The script is worthless if nothing invokes it, and the unit and the installer
# are edited in different files.
grep -q '^ExecStartPre=%h/questura/infra/wait-for-postgres.sh$' \
  "$SCRIPT_DIR/host/systemd/questura-server.service.in" ||
  fail "questura-server.service.in does not run wait-for-postgres.sh"

grep -q 'install -m 0755 "\$stage_directory/infra/wait-for-postgres.sh" "\$INFRA_ROOT/wait-for-postgres.sh"' \
  "$SCRIPT_DIR/stage-host-config.sh" ||
  fail "stage-host-config.sh does not install wait-for-postgres.sh"

echo "wait-for-postgres tests passed"
