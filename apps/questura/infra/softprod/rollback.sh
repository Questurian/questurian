#!/usr/bin/env bash
# Swap current and previous code releases. Database migrations are never reversed.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=release-lib.sh
. "$SCRIPT_DIR/release-lib.sh"

usage() {
  echo "Usage: $0 server|client|all" >&2
  exit 2
}

previous_target() {
  local component=$1
  local previous_link="$SOFTPROD_ROOT/previous-$component"
  local target

  if [[ ! -L $previous_link ]]; then
    echo "ERROR: previous release link is missing: $previous_link" >&2
    return 1
  fi
  target=$(canonical_path "$previous_link") || return
  require_component_release_directory "$component" "$target" || return
  printf '%s\n' "$target"
}

current_target() {
  local component=$1
  local current_link="$SOFTPROD_ROOT/current-$component"
  local target

  if [[ ! -L $current_link ]]; then
    echo "ERROR: current release link is missing: $current_link" >&2
    return 1
  fi
  target=$(canonical_path "$current_link") || return
  require_component_release_directory "$component" "$target" || return
  printf '%s\n' "$target"
}

rollback_component_to() {
  local component=$1
  local target=$2
  local target_sha

  target_sha=$(release_sha "$target") || return
  echo "==> Rolling back $component to ${target_sha:0:12}"
  activate_release "$component" "$target" || return
}

rollback_component() {
  local component=$1
  local target
  target=$(previous_target "$component") || return
  rollback_component_to "$component" "$target"
}

if (($# != 1)); then usage; fi

exec 9>"$SOFTPROD_ROOT/deploy.lock"
if ! flock -n 9; then
  echo "ERROR: a Questura deploy or rollback is already running" >&2
  exit 1
fi

case "$1" in
  server) rollback_component server ;;
  client) rollback_component client ;;
  all)
    original_client_target=$(current_target client) || exit 1
    original_server_target=$(current_target server) || exit 1
    original_client_sha=$(release_sha "$original_client_target") || exit 1
    original_server_sha=$(release_sha "$original_server_target") || exit 1
    if [[ $original_client_sha != "$original_server_sha" ]]; then
      echo "ERROR: current client/server releases are already mismatched: ${original_client_sha:0:12} != ${original_server_sha:0:12}" >&2
      exit 1
    fi

    client_target=$(previous_target client) || exit 1
    server_target=$(previous_target server) || exit 1
    client_sha=$(release_sha "$client_target") || exit 1
    server_sha=$(release_sha "$server_target") || exit 1
    if [[ $client_sha != "$server_sha" ]]; then
      echo "ERROR: client/server previous releases do not form one deploy: ${client_sha:0:12} != ${server_sha:0:12}" >&2
      exit 1
    fi

    if ! rollback_component_to client "$client_target"; then
      echo "Client rollback failed; restoring original client before aborting. Server was not changed." >&2
      if client_now_target=$(current_target client 2>/dev/null); then
        client_now_sha=$(release_sha "$client_now_target" 2>/dev/null || true)
        if [[ -n $client_now_sha ]]; then
          echo "Client link currently identifies ${client_now_sha:0:12}." >&2
        fi
      else
        echo "CRITICAL: cannot identify client release after failed rollback." >&2
      fi
      if ! restore_component client "$original_client_target" "$original_client_sha"; then
        echo "CRITICAL: original client restoration failed; server remains untouched." >&2
      fi
      exit 1
    fi
    if ! rollback_component_to server "$server_target"; then
      server_now_target=$(current_target server) || {
        echo "CRITICAL: cannot identify server release after failed rollback." >&2
        exit 1
      }
      server_now_sha=$(release_sha "$server_now_target") || {
        echo "CRITICAL: cannot identify server SHA after failed rollback." >&2
        exit 1
      }

      if [[ $server_now_sha == "$server_sha" ]]; then
        echo "Server rollback failed but its link remains on target; leaving client on matching target." >&2
      elif [[ $server_now_sha == "$original_server_sha" ]]; then
        echo "Server rollback failed and restored original link; restoring client to match." >&2
        client_forward_target=$(previous_target client) || exit 1
        client_forward_sha=$(release_sha "$client_forward_target") || exit 1
        if [[ $client_forward_sha != "$original_server_sha" ]]; then
          echo "CRITICAL: client forward target does not match restored server." >&2
          exit 1
        fi
        if ! rollback_component_to client "$client_forward_target"; then
          echo "CRITICAL: client restoration also failed; components may be on mismatched releases." >&2
        fi
      else
        echo "CRITICAL: server now points at unexpected release ${server_now_sha:0:12}; client was not changed again." >&2
      fi
      exit 1
    fi
    ;;
  *) usage ;;
esac

echo "Rollback complete. Database remains on its current forward-migrated schema."
