#!/usr/bin/env bash
# Adopt the first prepared immutable release and versioned host units atomically.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SOURCE_REPO=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
DEPLOY_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}
RELEASES_ROOT=${QUESTURA_RELEASES_ROOT:-"$DEPLOY_ROOT/releases"}
CONFIG_ROOT=${QUESTURA_CONFIG_ROOT:-"$DEPLOY_ROOT/config"}
INFRA_ROOT=${QUESTURA_INFRA_ROOT:-"$DEPLOY_ROOT/infra"}
RENDERED_ROOT=${QUESTURA_RENDERED_UNITS_ROOT:-"$INFRA_ROOT/systemd"}
USER_UNIT_ROOT=${QUESTURA_USER_UNIT_ROOT:-"${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"}
WRAPPER_SOURCE=${QUESTURA_DEPLOY_WRAPPER_SOURCE:-"$SCRIPT_DIR/host-deploy-wrapper.sh"}
WRAPPER_TARGET=${QUESTURA_DEPLOY_WRAPPER_TARGET:-"$DEPLOY_ROOT/deploy.sh"}
TARGET_SHA=''
TARGET_RELEASE=''
TARGET_SERVER=''
TARGET_CLIENT=''
CHECKOUT_STATUS=''
BACKUP_DIRECTORY=''
BACKUP_READY=0
MUTATION_STARTED=0
ADOPTION_COMPLETE=0
stage=initialization

UNITS=(questura-server questura-client questura-tunnel)

export QUESTURA_RELEASES_ROOT="$RELEASES_ROOT"
# shellcheck source=release-lib.sh
. "$SCRIPT_DIR/release-lib.sh"
# shellcheck source=release-builder.sh
. "$SCRIPT_DIR/release-builder.sh"

file_mode() {
  python3 - "$1" <<'PY'
import pathlib
import stat
import sys
print(f"{stat.S_IMODE(pathlib.Path(sys.argv[1]).stat().st_mode):04o}")
PY
}

require_regular_file() {
  local path=$1
  if [[ ! -f $path || -L $path || ! -r $path ]]; then
    echo "ERROR: required readable regular file is missing: $path" >&2
    return 1
  fi
}

atomic_install() {
  local source=$1
  local destination=$2
  local mode=$3
  local directory temporary status

  directory=$(dirname -- "$destination") || return
  mkdir -p "$directory"
  temporary=$(mktemp "$directory/.$(basename -- "$destination").adopt.XXXXXX") || return
  if install -m "$mode" "$source" "$temporary"; then
    :
  else
    status=$?
    rm -f -- "$temporary"
    return "$status"
  fi
  if mv -f "$temporary" "$destination"; then
    :
  else
    status=$?
    rm -f -- "$temporary"
    return "$status"
  fi
}

atomic_restore() {
  local source=$1
  local destination=$2
  local directory temporary

  directory=$(dirname -- "$destination") || return
  temporary=$(mktemp "$directory/.$(basename -- "$destination").restore.XXXXXX") || return
  if ! cp -p "$source" "$temporary" || ! mv -f "$temporary" "$destination"; then
    rm -f -- "$temporary"
    return 1
  fi
  cmp -s "$source" "$destination" && [[ $(file_mode "$source") == "$(file_mode "$destination")" ]]
}

healthy_release_sha() {
  python3 -c '
import json
import sys
try:
    body = json.load(sys.stdin)
except (json.JSONDecodeError, UnicodeDecodeError):
    raise SystemExit(1)
value = body.get("releaseSha") if isinstance(body, dict) and body.get("status") == "healthy" else None
if not isinstance(value, str) or not value:
    raise SystemExit(1)
print(value)
'
}

capture_health_sha() {
  local label=$1
  local url=$2
  local attempt body release

  for attempt in $(seq 1 "$SOFTPROD_HEALTH_ATTEMPTS"); do
    body=$(curl --fail --silent --show-error --max-time 10 "$url" 2>/dev/null || true)
    release=$(healthy_release_sha <<< "$body" || true)
    if [[ -n $release ]]; then
      echo "    captured $label baseline" >&2
      printf '%s\n' "$release"
      return 0
    fi
    sleep "$SOFTPROD_HEALTH_SLEEP_SECONDS"
  done

  echo "ERROR: $label baseline is not healthy: $url" >&2
  return 1
}

require_service_state() {
  local unit=$1
  if ! systemctl --user is-active --quiet "$unit"; then
    echo "ERROR: required user service is not active: $unit" >&2
    return 1
  fi
  if ! systemctl --user is-enabled --quiet "$unit"; then
    echo "ERROR: required user service is not enabled: $unit" >&2
    return 1
  fi
}

restore_one_file() {
  local backup=$1
  local destination=$2
  local label=$3

  if ! atomic_restore "$backup" "$destination"; then
    echo "CRITICAL: failed to restore $label from $backup" >&2
    return 1
  fi
}

remove_attempted_link() {
  local link=$1
  local expected=$2
  local actual

  if [[ -L $link ]]; then
    actual=$(canonical_path "$link") || {
      echo "CRITICAL: failed to resolve attempted release link: $link" >&2
      return 1
    }
    if [[ $actual != "$expected" ]]; then
      echo "CRITICAL: refusing to remove changed release link: $link -> $actual" >&2
      return 1
    fi
    if ! unlink "$link"; then
      echo "CRITICAL: failed to remove attempted release link: $link" >&2
      return 1
    fi
  elif [[ -e $link ]]; then
    echo "CRITICAL: attempted release link became a non-symlink: $link" >&2
    return 1
  fi
}

rollback_adoption() {
  local failed=0
  local unit

  echo "==> Restoring pre-adoption host state" >&2
  for unit in "${UNITS[@]}"; do
    restore_one_file \
      "$BACKUP_DIRECTORY/units/$unit.service" \
      "$USER_UNIT_ROOT/$unit.service" \
      "$unit.service" || failed=1
  done
  restore_one_file "$BACKUP_DIRECTORY/wrapper/deploy.sh" "$WRAPPER_TARGET" "deploy wrapper" || failed=1

  if ! systemctl --user daemon-reload; then
    echo "CRITICAL: failed to reload restored user units" >&2
    failed=1
  fi
  for unit in "${UNITS[@]}"; do
    if ! systemctl --user restart "$unit"; then
      echo "CRITICAL: failed to restart restored service: $unit" >&2
      failed=1
    fi
  done

  wait_for_release_health "restored local server" "http://127.0.0.1:4000/api/health" "$BASELINE_SERVER_LOCAL" || failed=1
  wait_for_release_health "restored public server" "https://cms.questurian.com/api/health" "$BASELINE_SERVER_PUBLIC" || failed=1
  wait_for_release_health "restored local client" "http://127.0.0.1:3000/api/health" "$BASELINE_CLIENT_LOCAL" || failed=1
  wait_for_release_health "restored public client" "https://www.questurian.com/api/health" "$BASELINE_CLIENT_PUBLIC" || failed=1

  for unit in "${UNITS[@]}"; do
    if ! require_service_state "$unit"; then failed=1; fi
  done

  remove_attempted_link "$DEPLOY_ROOT/current-server" "$TARGET_SERVER" || failed=1
  remove_attempted_link "$DEPLOY_ROOT/current-client" "$TARGET_CLIENT" || failed=1
  return "$failed"
}

report_failure() {
  local exit_code=${1:-1}
  local rollback_failed=0

  trap - ERR INT TERM
  set +e
  if ((BACKUP_READY == 1 && MUTATION_STARTED == 1 && ADOPTION_COMPLETE == 0)); then
    rollback_adoption || rollback_failed=1
  fi
  if ((rollback_failed == 1)); then
    echo "CRITICAL: initial release adoption rollback is incomplete; recover from $BACKUP_DIRECTORY" >&2
  fi
  echo "ERROR: initial release adoption failed during $stage (exit $exit_code)" >&2
  exit "$exit_code"
}
trap 'report_failure "$?"' ERR
trap 'report_failure 130' INT
trap 'report_failure 143' TERM

if (($# > 0)); then
  echo "ERROR: adopt-host-release.sh takes no arguments" >&2
  exit 2
fi

mkdir -p "$DEPLOY_ROOT"
exec 9>"$DEPLOY_ROOT/deploy.lock"
if ! flock -n 9; then
  echo "ERROR: another Questura deploy or host operation is running" >&2
  exit 1
fi

# Capture every mutable prerequisite only while holding the shared host lock.
stage="release preflight"
TARGET_SHA=$(git -C "$SOURCE_REPO" rev-parse --verify 'HEAD^{commit}')
if [[ ! $TARGET_SHA =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: target is not a full commit SHA: $TARGET_SHA" >&2
  exit 1
fi
CHECKOUT_STATUS=$(git -C "$SOURCE_REPO" status --porcelain --untracked-files=normal) || report_failure "$?"
if [[ -n $CHECKOUT_STATUS ]]; then
  echo "ERROR: deployment checkout is not clean" >&2
  exit 1
fi
for link in \
  "$DEPLOY_ROOT/current-server" \
  "$DEPLOY_ROOT/current-client" \
  "$DEPLOY_ROOT/previous-server" \
  "$DEPLOY_ROOT/previous-client"; do
  if [[ -e $link || -L $link ]]; then
    echo "ERROR: initial release link already exists: $link" >&2
    exit 1
  fi
done

require_complete_release "$TARGET_SHA"
TARGET_RELEASE=$(canonical_path "$RELEASES_ROOT/$TARGET_SHA")
TARGET_SERVER="$TARGET_RELEASE/apps/questura/apps/server"
TARGET_CLIENT="$TARGET_RELEASE/apps/questura/apps/client"

require_regular_file "$CONFIG_ROOT/server.env"
require_regular_file "$CONFIG_ROOT/client.env"
require_regular_file "$INFRA_ROOT/tunnel-config.yml"
require_regular_file "$WRAPPER_SOURCE"
require_regular_file "$WRAPPER_TARGET"
if [[ ! -x $WRAPPER_SOURCE || ! -x $WRAPPER_TARGET ]]; then
  echo "ERROR: deploy wrappers must be executable" >&2
  exit 1
fi

STAGED_UNIT_PATHS=()
for unit in "${UNITS[@]}"; do
  require_regular_file "$RENDERED_ROOT/$unit.service"
  require_regular_file "$USER_UNIT_ROOT/$unit.service"
  STAGED_UNIT_PATHS+=("$RENDERED_ROOT/$unit.service")
done
systemd-analyze --user verify "${STAGED_UNIT_PATHS[@]}"
for unit in "${UNITS[@]}"; do require_service_state "$unit"; done

stage="baseline health capture"
BASELINE_SERVER_LOCAL=$(capture_health_sha "local server" "http://127.0.0.1:4000/api/health") || report_failure "$?"
BASELINE_SERVER_PUBLIC=$(capture_health_sha "public server" "https://cms.questurian.com/api/health") || report_failure "$?"
BASELINE_CLIENT_LOCAL=$(capture_health_sha "local client" "http://127.0.0.1:3000/api/health") || report_failure "$?"
BASELINE_CLIENT_PUBLIC=$(capture_health_sha "public client" "https://www.questurian.com/api/health") || report_failure "$?"

stage="host backup"
mkdir -p "$DEPLOY_ROOT/backups/host-adoption"
BACKUP_DIRECTORY=$(mktemp -d "$DEPLOY_ROOT/backups/host-adoption/adoption.XXXXXX")
chmod 0700 "$BACKUP_DIRECTORY"
mkdir -p "$BACKUP_DIRECTORY/units" "$BACKUP_DIRECTORY/wrapper"
for unit in "${UNITS[@]}"; do
  cp -p "$USER_UNIT_ROOT/$unit.service" "$BACKUP_DIRECTORY/units/$unit.service"
  cmp -s "$USER_UNIT_ROOT/$unit.service" "$BACKUP_DIRECTORY/units/$unit.service"
  [[ $(file_mode "$USER_UNIT_ROOT/$unit.service") == "$(file_mode "$BACKUP_DIRECTORY/units/$unit.service")" ]]
done
cp -p "$WRAPPER_TARGET" "$BACKUP_DIRECTORY/wrapper/deploy.sh"
cmp -s "$WRAPPER_TARGET" "$BACKUP_DIRECTORY/wrapper/deploy.sh"
[[ $(file_mode "$WRAPPER_TARGET") == "$(file_mode "$BACKUP_DIRECTORY/wrapper/deploy.sh")" ]]
printf '%s\n' \
  "QUESTURA_RELEASE_SHA=$TARGET_SHA" \
  "BASELINE_SERVER_LOCAL=$BASELINE_SERVER_LOCAL" \
  "BASELINE_SERVER_PUBLIC=$BASELINE_SERVER_PUBLIC" \
  "BASELINE_CLIENT_LOCAL=$BASELINE_CLIENT_LOCAL" \
  "BASELINE_CLIENT_PUBLIC=$BASELINE_CLIENT_PUBLIC" \
  'questura-server=active,enabled' \
  'questura-client=active,enabled' \
  'questura-tunnel=active,enabled' > "$BACKUP_DIRECTORY/manifest"
chmod 0600 "$BACKUP_DIRECTORY/manifest"
BACKUP_READY=1

stage="release link installation"
MUTATION_STARTED=1
atomic_symlink "$TARGET_SERVER" "$DEPLOY_ROOT/current-server"
atomic_symlink "$TARGET_CLIENT" "$DEPLOY_ROOT/current-client"

stage="unit and wrapper installation"
for unit in "${UNITS[@]}"; do
  atomic_install "$RENDERED_ROOT/$unit.service" "$USER_UNIT_ROOT/$unit.service" 0644
done
atomic_install "$WRAPPER_SOURCE" "$WRAPPER_TARGET" 0755

stage="user unit reload"
systemctl --user daemon-reload

stage="server activation"
systemctl --user restart questura-server
verify_component server "$TARGET_SHA"

stage="client activation"
systemctl --user restart questura-client
verify_component client "$TARGET_SHA"

stage="tunnel activation"
systemctl --user restart questura-tunnel
verify_component server "$TARGET_SHA"
verify_component client "$TARGET_SHA"
for unit in "${UNITS[@]}"; do require_service_state "$unit"; done

ADOPTION_COMPLETE=1
trap - ERR INT TERM
echo "Adopted initial immutable release $TARGET_SHA"
echo "Backup: $BACKUP_DIRECTORY"
