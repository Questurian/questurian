#!/usr/bin/env bash
# Block until Postgres accepts TCP connections, or give up loudly.
#
# Postgres runs as a Docker container (`questura-postgres`), started by the
# system Docker daemon. `questura-server` is a *user* unit, so it has no unit to
# order itself after -- systemd starts it as soon as the network is up, which
# after a reboot is well before the container is listening. The server then logs
# `Database connection failed`, raises an unhandledRejection, and dies; systemd
# restarts it and it eventually comes up healthy. That is roughly a minute of
# 502s after every reboot, and a pair of alarming log lines that mean nothing.
#
# Waiting here turns that into a quiet pause before the process ever starts.
set -Eeuo pipefail

timeout_seconds=${QUESTURA_PG_WAIT_TIMEOUT:-90}

# The unit loads server.env, so DATABASE_URI is already in the environment.
# Parse rather than hardcode 5433: the port lives in compose.yml and has moved
# before.
uri=${DATABASE_URI:-}
hostport=${uri##*@}
hostport=${hostport%%/*}
hostport=${hostport%%\?*}
host=${hostport%%:*}
port=${hostport##*:}

# No colon in the authority means no explicit port; and an unparseable URI must
# not silently become a connection test against nothing.
if [[ $port == "$host" ]]; then
  port=5432
fi
if [[ -z $host || -z $port || ! $port =~ ^[0-9]+$ ]]; then
  echo "wait-for-postgres: cannot read host:port from DATABASE_URI" >&2
  exit 1
fi

for ((i = 0; i < timeout_seconds; i++)); do
  if (exec 3<>"/dev/tcp/$host/$port") 2>/dev/null; then
    exec 3>&- 2>/dev/null || true
    [[ $i -gt 0 ]] && echo "wait-for-postgres: $host:$port ready after ${i}s"
    exit 0
  fi
  sleep 1
done

echo "wait-for-postgres: $host:$port refused connections for ${timeout_seconds}s" >&2
exit 1
