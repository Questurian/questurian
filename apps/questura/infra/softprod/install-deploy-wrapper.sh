#!/usr/bin/env bash
# Install repository-controlled deployment wrapper without losing host copy.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}
TARGET="$DEPLOY_ROOT/deploy.sh"
BACKUP_ROOT="$DEPLOY_ROOT/backups/deploy"
temporary=''

cleanup() {
  if [[ -n $temporary && -e $temporary ]]; then
    rm -f -- "$temporary"
  fi
}
trap cleanup EXIT

mkdir -p "$BACKUP_ROOT"
if [[ -e "$TARGET" ]]; then
  backup=$(mktemp "$BACKUP_ROOT/deploy.sh.XXXXXX")
  cp -p "$TARGET" "$backup"
  echo "Preserved previous wrapper at $backup"
fi

temporary=$(mktemp "$DEPLOY_ROOT/.deploy.sh.XXXXXX")
install -m 0755 "$SCRIPT_DIR/host-deploy-wrapper.sh" "$temporary"
mv -f "$temporary" "$TARGET"
temporary=''
echo "Installed $TARGET"
