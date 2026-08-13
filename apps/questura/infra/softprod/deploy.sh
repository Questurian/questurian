#!/usr/bin/env bash
# Build one commit-addressed release, migrate forward, then activate both parts.
# Use host-deploy-wrapper.sh as the host entry point so code sync happens first.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SOURCE_REPO=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
DEPLOY_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}
RELEASES_ROOT=${QUESTURA_RELEASES_ROOT:-"$DEPLOY_ROOT/releases"}
CONFIG_ROOT=${QUESTURA_CONFIG_ROOT:-"$DEPLOY_ROOT/config"}
TARGET_SHA=$(git -C "$SOURCE_REPO" rev-parse HEAD)
stage=initialization
reconcile_original_pair=0
original_server_target=''
original_client_target=''
original_previous_server=''
original_previous_client=''

export QUESTURA_RELEASES_ROOT="$RELEASES_ROOT"
# shellcheck source=release-lib.sh
. "$SCRIPT_DIR/release-lib.sh"
# shellcheck source=release-builder.sh
. "$SCRIPT_DIR/release-builder.sh"

previous_component_target() {
  local component=$1
  local link="$DEPLOY_ROOT/previous-$component"
  local target

  if [[ ! -e $link && ! -L $link ]]; then return 0; fi
  if [[ ! -L $link ]]; then
    echo "ERROR: previous release path is not a symlink: $link" >&2
    return 1
  fi
  target=$(canonical_path "$link") || return
  require_component_release_directory "$component" "$target" || return
  printf '%s\n' "$target"
}

restore_previous_target() {
  local component=$1
  local target=$2
  local link="$DEPLOY_ROOT/previous-$component"

  if [[ -n $target ]]; then
    atomic_symlink "$target" "$link" || return
  elif [[ -L $link ]]; then
    unlink "$link" || return
  elif [[ -e $link ]]; then
    echo "CRITICAL: previous release path cannot be restored: $link" >&2
    return 1
  fi
}

restore_original_pair() {
  local failed=0 current_client current_server

  echo "Target release did not commit; reconciling original client/server pair." >&2
  if ! restore_component client "$original_client_target" "$original_client_sha"; then
    echo "CRITICAL: original client restoration failed." >&2
    failed=1
  fi
  if ! restore_component server "$original_server_target" "$original_server_sha"; then
    echo "CRITICAL: original server restoration failed." >&2
    failed=1
  fi
  if ! restore_previous_target client "$original_previous_client"; then failed=1; fi
  if ! restore_previous_target server "$original_previous_server"; then failed=1; fi

  current_client=$(canonical_path "$DEPLOY_ROOT/current-client" 2>/dev/null || true)
  current_server=$(canonical_path "$DEPLOY_ROOT/current-server" 2>/dev/null || true)
  echo "Current links after reconciliation: client=${current_client:-unknown} server=${current_server:-unknown}" >&2
  ((failed == 0))
}

report_failure() {
  local exit_code=${1:-1}
  trap - ERR INT TERM
  if ! cleanup_release_staging; then
    echo "CRITICAL: failed to clean release staging directory." >&2
  fi
  echo "ERROR: deploy failed during $stage (exit $exit_code)" >&2

  if ((reconcile_original_pair == 1)); then
    restore_original_pair || true
  fi
  exit "$exit_code"
}
trap 'report_failure "$?"' ERR
trap 'report_failure 130' INT
trap 'report_failure 143' TERM

if (($# > 0)); then
  echo "ERROR: deploy.sh takes no arguments" >&2
  exit 2
fi

if [[ ! $TARGET_SHA =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: deployment target is not a full commit SHA: $TARGET_SHA" >&2
  exit 1
fi

if [[ ${QUESTURA_DEPLOY_LOCK_HELD:-0} != 1 ]]; then
  exec 9>"$DEPLOY_ROOT/deploy.lock"
  if ! flock -n 9; then
    echo "ERROR: another Questura deploy is running" >&2
    exit 1
  fi
fi

if ! git -C "$SOURCE_REPO" diff --quiet || ! git -C "$SOURCE_REPO" diff --cached --quiet; then
  echo "ERROR: deployment checkout has tracked changes" >&2
  exit 1
fi

export NVM_DIR=${NVM_DIR:-"$HOME/.nvm"}
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use "${QUESTURA_NODE_VERSION:-22}" >/dev/null
fi

current_component_target() {
  local component=$1
  local link="$DEPLOY_ROOT/current-$component"
  local target

  if [[ ! -L $link ]]; then
    echo "ERROR: release-based host units are not initialized: $link is missing" >&2
    return 1
  fi
  target=$(canonical_path "$link") || return
  require_component_release_directory "$component" "$target" || return
  printf '%s\n' "$target"
}

stage="current release preflight"
original_server_target=$(current_component_target server)
original_client_target=$(current_component_target client)
original_server_sha=$(release_sha "$original_server_target")
original_client_sha=$(release_sha "$original_client_target")
if [[ $original_server_sha != "$original_client_sha" ]]; then
  echo "ERROR: current client/server releases are mismatched: ${original_client_sha:0:12} != ${original_server_sha:0:12}" >&2
  exit 1
fi
original_previous_server=$(previous_component_target server)
original_previous_client=$(previous_component_target client)

stage="server release preparation"
echo "==> Preparing release ${TARGET_SHA:0:12}"
prepare_server_release "$TARGET_SHA"
RELEASE=$(canonical_path "$RELEASES_ROOT/$TARGET_SHA")
SERVER="$RELEASE/apps/questura/apps/server"
CLIENT="$RELEASE/apps/questura/apps/client"
export QUESTURA_RELEASE_SHA="$TARGET_SHA"

if [[ $original_server_target == "$SERVER" && $original_client_target == "$CLIENT" ]]; then
  require_complete_release "$TARGET_SHA"
  stage="existing release verification"
  echo "==> Release already active; verifying exact identity"
  verify_component server "$TARGET_SHA"
  verify_component client "$TARGET_SHA"
  systemctl --user is-active questura-server questura-client questura-tunnel
  echo "Already deployed $TARGET_SHA."
  exit 0
fi

stage="migration preflight"
echo "==> Checking pending database migrations"
cd "$SERVER"
node scripts/deploy/check-pending-migrations.mjs

stage="database migration"
echo "==> Running database migrations"
pnpm db:migrate
node scripts/deploy/check-pending-migrations.mjs --require-clean

stage="server activation"
echo "==> Activating server"
validate_server_release "$TARGET_SHA"
reconcile_original_pair=1
activate_release server "$SERVER"

# Client may statically prerender backend data. Build only after target server
# is reachable through public Cloudflare path and reports exact target SHA.
stage="client release completion"
echo "==> Completing client release"
complete_client_release "$TARGET_SHA"

stage="client activation"
echo "==> Activating client"
require_complete_release "$TARGET_SHA"
activate_release client "$CLIENT"
reconcile_original_pair=0

stage="final release verification"
verify_component server "$TARGET_SHA"
verify_component client "$TARGET_SHA"
systemctl --user is-active questura-server questura-client questura-tunnel
echo "Deployed $TARGET_SHA."
