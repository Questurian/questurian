#!/usr/bin/env bash
# Prepare and migrate the first immutable host release without activating it.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SOURCE_REPO=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
DEPLOY_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}
RELEASES_ROOT=${QUESTURA_RELEASES_ROOT:-"$DEPLOY_ROOT/releases"}
CONFIG_ROOT=${QUESTURA_CONFIG_ROOT:-"$DEPLOY_ROOT/config"}
TARGET_SHA=''
stage=initialization

export QUESTURA_RELEASES_ROOT="$RELEASES_ROOT"
# shellcheck source=release-lib.sh
. "$SCRIPT_DIR/release-lib.sh"
# shellcheck source=release-builder.sh
. "$SCRIPT_DIR/release-builder.sh"

report_failure() {
  local exit_code=${1:-1}
  trap - ERR INT TERM
  if ! cleanup_release_staging; then
    echo "CRITICAL: failed to clean release staging directory." >&2
  fi
  echo "ERROR: initial release preparation failed during $stage (exit $exit_code)" >&2
  exit "$exit_code"
}
trap 'report_failure "$?"' ERR
trap 'report_failure 130' INT
trap 'report_failure 143' TERM

if (($# > 0)); then
  echo "ERROR: prepare-host-release.sh takes no arguments" >&2
  exit 2
fi

exec 9>"$DEPLOY_ROOT/deploy.lock"
if ! flock -n 9; then
  echo "ERROR: another Questura deploy or host operation is running" >&2
  exit 1
fi

# Capture and validate all mutable state only after holding shared host lock.
TARGET_SHA=$(git -C "$SOURCE_REPO" rev-parse HEAD)
if [[ ! $TARGET_SHA =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: target is not a full commit SHA: $TARGET_SHA" >&2
  exit 1
fi
if [[ -e $DEPLOY_ROOT/current-server || -L $DEPLOY_ROOT/current-server || -e $DEPLOY_ROOT/current-client || -L $DEPLOY_ROOT/current-client ]]; then
  echo "ERROR: current release links already exist; use normal deploy.sh" >&2
  exit 1
fi
if ! git -C "$SOURCE_REPO" diff --quiet || ! git -C "$SOURCE_REPO" diff --cached --quiet; then
  echo "ERROR: deployment checkout has tracked changes" >&2
  exit 1
fi

export NVM_DIR=${NVM_DIR:-"$HOME/.nvm"}
if [[ -s $NVM_DIR/nvm.sh ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use "${QUESTURA_NODE_VERSION:-22}" >/dev/null
fi

stage="server release preparation"
echo "==> Preparing initial release ${TARGET_SHA:0:12}"
prepare_server_release "$TARGET_SHA"
RELEASE=$(canonical_path "$RELEASES_ROOT/$TARGET_SHA")
SERVER="$RELEASE/apps/questura/apps/server"
export QUESTURA_RELEASE_SHA="$TARGET_SHA"

stage="migration preflight"
echo "==> Checking pending database migrations"
cd "$SERVER"
node scripts/deploy/check-pending-migrations.mjs

stage="database migration"
echo "==> Running database migrations"
pnpm db:migrate
node scripts/deploy/check-pending-migrations.mjs --require-clean

stage="client release completion"
echo "==> Completing client release against current public server"
complete_client_release "$TARGET_SHA"

stage="release verification"
require_complete_release "$TARGET_SHA"
echo "Prepared release $TARGET_SHA. Active services and release links were not changed."
