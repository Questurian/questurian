#!/usr/bin/env bash
# Passive Questura soft-production health monitor. Never mutates live services.
set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}
RELEASES_ROOT=${QUESTURA_RELEASES_ROOT:-"$DEPLOY_ROOT/releases"}
INFRA_ROOT=${QUESTURA_INFRA_ROOT:-"$DEPLOY_ROOT/infra"}
COMPOSE_FILE=${QUESTURA_COMPOSE_FILE:-"$INFRA_ROOT/compose.yml"}
COMPOSE_ENV=${QUESTURA_COMPOSE_ENV_FILE:-"$INFRA_ROOT/.env"}
CURL_MAX_TIME=${QUESTURA_MONITOR_CURL_MAX_TIME:-10}
CURL_CONNECT_TIMEOUT=${QUESTURA_MONITOR_CURL_CONNECT_TIMEOUT:-5}

LOCAL_SERVER_URL=${QUESTURA_MONITOR_LOCAL_SERVER_URL:-http://127.0.0.1:4000/api/health}
PUBLIC_SERVER_URL=${QUESTURA_MONITOR_PUBLIC_SERVER_URL:-https://cms.questurian.com/api/health}
LOCAL_CLIENT_URL=${QUESTURA_MONITOR_LOCAL_CLIENT_URL:-http://127.0.0.1:3000/api/health}
PUBLIC_CLIENT_URL=${QUESTURA_MONITOR_PUBLIC_CLIENT_URL:-https://www.questurian.com/api/health}

export QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT"
export QUESTURA_RELEASES_ROOT="$RELEASES_ROOT"
# shellcheck source=release-lib.sh
. "$SCRIPT_DIR/release-lib.sh"

declare -a diagnostics=()
failures=0

record_ok() {
  diagnostics+=("OK $*")
}

record_failure() {
  diagnostics+=("FAIL $*")
  failures=$((failures + 1))
}

print_diagnostics() {
  local line
  for line in "${diagnostics[@]}"; do
    printf '%s\n' "$line"
  done
}

# Return 0 when held elsewhere, 1 when idle, 2 when probe is unavailable.
# The descriptor closes immediately: monitoring must never block a real deploy.
deploy_lock_is_busy() {
  local result

  if [[ ! -r $DEPLOY_ROOT/deploy.lock ]] || ! command -v flock >/dev/null 2>&1; then
    return 2
  fi
  if ! exec 8<"$DEPLOY_ROOT/deploy.lock"; then
    return 2
  fi

  flock -n 8 >/dev/null 2>&1
  result=$?
  exec 8<&-

  case "$result" in
    0) return 1 ;;
    1) return 0 ;;
    *) return 2 ;;
  esac
}

# Print one validated, paired release snapshot as SHA|server-path|client-path.
release_pair_snapshot() {
  local server_link="$DEPLOY_ROOT/current-server"
  local client_link="$DEPLOY_ROOT/current-client"
  local server_target client_target server_sha client_sha

  [[ -L $server_link && -L $client_link ]] || return 1
  server_target=$(canonical_path "$server_link" 2>/dev/null) || return 1
  client_target=$(canonical_path "$client_link" 2>/dev/null) || return 1
  require_component_release_directory server "$server_target" >/dev/null 2>&1 || return 1
  require_component_release_directory client "$client_target" >/dev/null 2>&1 || return 1
  server_sha=$(release_sha "$server_target" 2>/dev/null) || return 1
  client_sha=$(release_sha "$client_target" 2>/dev/null) || return 1
  [[ $server_sha == "$client_sha" ]] || return 1

  printf '%s|%s|%s\n' "$server_sha" "$server_target" "$client_target"
}

check_endpoint() {
  local label=$1
  local url=$2
  local expected_sha=$3
  local body_file http_code curl_code parsed parse_code observed_status observed_sha

  body_file=$(mktemp) || {
    record_failure "check=endpoint label=$label reason=temp-file-unavailable"
    return
  }

  http_code=$(curl \
    --silent \
    --show-error \
    --connect-timeout "$CURL_CONNECT_TIMEOUT" \
    --max-time "$CURL_MAX_TIME" \
    --output "$body_file" \
    --write-out '%{http_code}' \
    "$url" 2>/dev/null)
  curl_code=$?

  if ((curl_code != 0)); then
    rm -f -- "$body_file"
    record_failure "check=endpoint label=$label reason=request-failed"
    return
  fi

  parsed=$(python3 - "$body_file" "$expected_sha" <<'PY'
import json
import re
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as source:
        body = json.load(source)
except (OSError, UnicodeError, json.JSONDecodeError):
    raise SystemExit(2)

if not isinstance(body, dict):
    raise SystemExit(2)

status = body.get("status")
release_sha = body.get("releaseSha")
safe_status = status if status in {"healthy", "unhealthy"} else "invalid"
safe_sha = release_sha if isinstance(release_sha, str) and re.fullmatch(r"[0-9a-f]{40}", release_sha) else "invalid"
print(f"{safe_status}|{safe_sha}")
raise SystemExit(0 if status == "healthy" and release_sha == sys.argv[2] else 1)
PY
  )
  parse_code=$?
  rm -f -- "$body_file"

  if [[ ! $http_code =~ ^[0-9]{3}$ ]]; then
    record_failure "check=endpoint label=$label reason=invalid-http-status"
    return
  fi
  if [[ $http_code != 200 ]]; then
    record_failure "check=endpoint label=$label reason=http status=$http_code"
    return
  fi
  if ((parse_code == 2)); then
    record_failure "check=endpoint label=$label reason=invalid-json"
    return
  fi
  if ((parse_code != 0)); then
    IFS='|' read -r observed_status observed_sha <<< "$parsed"
    record_failure "check=endpoint label=$label reason=identity expected_sha=$expected_sha observed_status=${observed_status:-invalid} observed_sha=${observed_sha:-invalid}"
    return
  fi

  record_ok "check=endpoint label=$label release_sha=$expected_sha"
}

check_unit() {
  local unit=$1
  local state code safe_state

  state=$(systemctl --user is-active "$unit" 2>/dev/null)
  code=$?
  case "$state" in
    active|inactive|failed|activating|deactivating) safe_state=$state ;;
    *) safe_state=unknown ;;
  esac

  if ((code == 0)) && [[ $state == active ]]; then
    record_ok "check=unit unit=$unit state=active"
  else
    record_failure "check=unit unit=$unit state=$safe_state"
  fi
}

check_compose() {
  if [[ ! -r $COMPOSE_FILE || ! -r $COMPOSE_ENV ]]; then
    record_failure "check=compose reason=missing-config"
    return
  fi

  if docker compose \
    --env-file "$COMPOSE_ENV" \
    -f "$COMPOSE_FILE" \
    config --quiet >/dev/null 2>&1; then
    record_ok "check=compose state=valid"
  else
    record_failure "check=compose reason=invalid-config"
  fi
}

check_container() {
  local container=$1
  local expected_service=$2
  local inspection code status health project service

  inspection=$(docker inspect \
    --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' \
    "$container" 2>/dev/null)
  code=$?
  if ((code != 0)); then
    record_failure "check=container container=$container reason=inspect-failed"
    return
  fi

  IFS='|' read -r status health project service <<< "$inspection"
  if [[ $status == running && $health == healthy && $project == infra && $service == "$expected_service" ]]; then
    record_ok "check=container container=$container state=running health=healthy"
  else
    case "$status" in running|created|restarting|removing|paused|exited|dead) ;; *) status=unknown ;; esac
    case "$health" in healthy|unhealthy|starting|missing) ;; *) health=unknown ;; esac
    record_failure "check=container container=$container reason=state-or-label-mismatch state=$status health=$health"
  fi
}

deploy_lock_is_busy
start_lock_state=$?
if ((start_lock_state == 0)); then
  printf '%s\n' 'SKIP check=monitor reason=deploy-active phase=start'
  exit 0
elif ((start_lock_state == 2)); then
  record_failure "check=deploy-lock phase=start reason=probe-failed"
fi

start_snapshot=''
start_sha=''
if start_snapshot=$(release_pair_snapshot); then
  IFS='|' read -r start_sha _ _ <<< "$start_snapshot"
  record_ok "check=release-pair phase=start release_sha=$start_sha"
else
  record_failure "check=release-pair phase=start reason=invalid-or-mismatched"
fi

if [[ -n $start_sha ]]; then
  check_endpoint local-server "$LOCAL_SERVER_URL" "$start_sha"
  check_endpoint public-server "$PUBLIC_SERVER_URL" "$start_sha"
  check_endpoint local-client "$LOCAL_CLIENT_URL" "$start_sha"
  check_endpoint public-client "$PUBLIC_CLIENT_URL" "$start_sha"
else
  for label in local-server public-server local-client public-client; do
    record_failure "check=endpoint label=$label reason=release-identity-unavailable"
  done
fi

check_unit questura-server
check_unit questura-client
check_unit questura-tunnel
check_compose
check_container questura-postgres postgres
check_container questura-redis redis

deploy_lock_is_busy
end_lock_state=$?
if ((end_lock_state == 0)); then
  printf '%s\n' 'SKIP check=monitor reason=deploy-active phase=end'
  exit 0
elif ((end_lock_state == 2)); then
  record_failure "check=deploy-lock phase=end reason=probe-failed"
fi

end_snapshot=''
if end_snapshot=$(release_pair_snapshot); then
  IFS='|' read -r end_sha _ _ <<< "$end_snapshot"
  if [[ -n $start_snapshot && $end_snapshot != "$start_snapshot" ]]; then
    printf 'SKIP check=monitor reason=release-transition from_sha=%s to_sha=%s\n' "$start_sha" "$end_sha"
    exit 0
  fi
  record_ok "check=release-pair phase=end release_sha=$end_sha"
elif [[ -n $start_snapshot ]]; then
  record_failure "check=release-pair phase=end reason=invalid-or-mismatched"
fi

if ((failures > 0)); then
  print_diagnostics
  printf 'FAIL check=summary failures=%s release_sha=%s\n' "$failures" "${start_sha:-unknown}"
  exit 1
fi

print_diagnostics
printf 'OK check=summary release_sha=%s\n' "$start_sha"
