#!/usr/bin/env bash
# Shared atomic release activation helpers. Source from deploy/rollback scripts.

SOFTPROD_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}
SOFTPROD_RELEASES=${QUESTURA_RELEASES_ROOT:-"$SOFTPROD_ROOT/releases"}
SOFTPROD_HEALTH_ATTEMPTS=${QUESTURA_HEALTH_ATTEMPTS:-30}
SOFTPROD_HEALTH_SLEEP_SECONDS=${QUESTURA_HEALTH_SLEEP_SECONDS:-3}

canonical_path() {
  python3 - "$1" <<'PY'
import os
import sys
print(os.path.realpath(sys.argv[1]))
PY
}

require_release_directory() {
  local candidate root
  candidate=$(canonical_path "$1") || return
  root=$(canonical_path "$SOFTPROD_RELEASES") || return

  if [[ ! -d $candidate || $candidate != "$root/"* ]]; then
    echo "ERROR: release target is outside $root: $candidate" >&2
    return 1
  fi
}

require_component_release_directory() {
  local component=$1
  local candidate=$2
  local canonical root release_directory release_name expected_suffix

  canonical=$(canonical_path "$candidate") || return
  root=$(canonical_path "$SOFTPROD_RELEASES") || return
  expected_suffix="/apps/questura/apps/$component"

  if [[ $canonical != *"$expected_suffix" ]]; then
    echo "ERROR: target is not a $component release directory: $canonical" >&2
    return 1
  fi
  release_directory=${canonical%"$expected_suffix"}
  if [[ $release_directory != "$root/"* ]]; then
    echo "ERROR: target is outside release root: $canonical" >&2
    return 1
  fi
  release_name=${release_directory#"$root/"}
  if [[ $release_name == */* || ! $release_name =~ ^[0-9a-f]{40}$ ]]; then
    echo "ERROR: release directory must be named by full commit SHA: $canonical" >&2
    return 1
  fi
}

release_sha() {
  local release_directory=$1
  local metadata="$release_directory/.env.release"
  local matches count canonical root relative directory_sha

  require_release_directory "$release_directory" || return
  canonical=$(canonical_path "$release_directory") || return
  root=$(canonical_path "$SOFTPROD_RELEASES") || return
  relative=${canonical#"$root/"}
  directory_sha=${relative%%/*}
  if [[ ! -f $metadata ]]; then
    echo "ERROR: release metadata is missing: $metadata" >&2
    return 1
  fi

  matches=$(grep -E '^QUESTURA_RELEASE_SHA=[0-9a-f]{40}$' "$metadata" || true)
  count=$(grep -c . <<< "$matches" || true)
  if [[ $count != 1 ]]; then
    echo "ERROR: release metadata must contain exactly one full commit SHA: $metadata" >&2
    return 1
  fi
  matches=${matches#QUESTURA_RELEASE_SHA=}
  if [[ $matches != "$directory_sha" ]]; then
    echo "ERROR: release metadata SHA does not match directory SHA: $metadata" >&2
    return 1
  fi
  printf '%s\n' "$matches"
}

atomic_symlink() {
  local target=$1
  local link=$2

  python3 - "$target" "$link" <<'PY'
import os
import pathlib
import sys
import uuid

target, link = sys.argv[1:]
destination = pathlib.Path(link)
destination.parent.mkdir(parents=True, exist_ok=True)
temporary = destination.parent / f'.{destination.name}.swap.{uuid.uuid4().hex}'

try:
    os.symlink(target, temporary)
    os.replace(temporary, destination)
finally:
    try:
        temporary.unlink()
    except FileNotFoundError:
        pass
PY
}

health_response_matches() {
  local expected_sha=$1
  python3 -c '
import json
import sys
try:
    body = json.load(sys.stdin)
except (json.JSONDecodeError, UnicodeDecodeError):
    raise SystemExit(1)
valid = isinstance(body, dict) and body.get("status") == "healthy" and body.get("releaseSha") == sys.argv[1]
raise SystemExit(0 if valid else 1)
' "$expected_sha"
}

wait_for_release_health() {
  local label=$1
  local url=$2
  local expected_sha=$3
  local attempt body

  for attempt in $(seq 1 "$SOFTPROD_HEALTH_ATTEMPTS"); do
    body=$(curl --fail --silent --show-error --max-time 10 "$url" 2>/dev/null || true)
    if health_response_matches "$expected_sha" <<< "$body"; then
      echo "    $label healthy at ${expected_sha:0:12}"
      return 0
    fi
    sleep "$SOFTPROD_HEALTH_SLEEP_SECONDS"
  done

  echo "ERROR: $label did not report release ${expected_sha:0:12}: $url" >&2
  return 1
}

component_unit() {
  case "$1" in
    server) printf '%s\n' questura-server ;;
    client) printf '%s\n' questura-client ;;
    *) echo "ERROR: unknown component: $1" >&2; return 1 ;;
  esac
}

verify_component() {
  local component=$1
  local expected_sha=$2

  case "$component" in
    server)
      wait_for_release_health "local server" "http://127.0.0.1:4000/api/health" "$expected_sha" &&
        wait_for_release_health "public server" "https://cms.questurian.com/api/health" "$expected_sha"
      ;;
    client)
      wait_for_release_health "local client" "http://127.0.0.1:3000/api/health" "$expected_sha" &&
        wait_for_release_health "public client" "https://www.questurian.com/api/health" "$expected_sha"
      ;;
    *) echo "ERROR: unknown component: $component" >&2; return 1 ;;
  esac
}

restore_component() {
  local component=$1
  local directory=$2
  local expected_sha=$3
  local current_link="$SOFTPROD_ROOT/current-$component"
  local unit

  unit=$(component_unit "$component") || return
  if ! atomic_symlink "$directory" "$current_link"; then
    echo "CRITICAL: failed to restore $component release link to ${expected_sha:0:12}." >&2
    return 1
  fi
  if ! systemctl --user restart "$unit"; then
    echo "CRITICAL: failed to restart restored $component release ${expected_sha:0:12}." >&2
    return 1
  fi
  if ! verify_component "$component" "$expected_sha"; then
    echo "CRITICAL: restored $component release is unhealthy." >&2
    return 1
  fi
}

activate_release() {
  local component=$1
  local target=$2
  local current_link="$SOFTPROD_ROOT/current-$component"
  local previous_link="$SOFTPROD_ROOT/previous-$component"
  local current target_sha current_sha unit

  require_component_release_directory "$component" "$target" || return
  target=$(canonical_path "$target") || return
  target_sha=$(release_sha "$target") || return
  unit=$(component_unit "$component") || return

  if [[ ! -L $current_link ]]; then
    echo "ERROR: current release link is missing: $current_link" >&2
    return 1
  fi
  current=$(canonical_path "$current_link") || return
  require_component_release_directory "$component" "$current" || return
  current_sha=$(release_sha "$current") || return

  if [[ $current == "$target" ]]; then
    if ! systemctl --user restart "$unit"; then
      echo "ERROR: failed to restart current $component release ${target_sha:0:12}." >&2
      return 1
    fi
    verify_component "$component" "$target_sha" || return
    return 0
  fi

  atomic_symlink "$target" "$current_link" || return
  if ! systemctl --user restart "$unit" || ! verify_component "$component" "$target_sha"; then
    echo "Activation failed; restoring $component release ${current_sha:0:12}." >&2
    restore_component "$component" "$current" "$current_sha" || true
    return 1
  fi

  if ! atomic_symlink "$current" "$previous_link"; then
    echo "Activation bookkeeping failed; restoring $component release ${current_sha:0:12}." >&2
    restore_component "$component" "$current" "$current_sha" || true
    return 1
  fi
}
