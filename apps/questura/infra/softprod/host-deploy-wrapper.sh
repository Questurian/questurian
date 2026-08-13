#!/usr/bin/env bash
# Stable host entry point. Install as ~/questura/deploy.sh.
set -Eeuo pipefail

DEPLOY_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}
APP=${QUESTURA_APP_ROOT:-"$DEPLOY_ROOT/app"}

exec 9>"$DEPLOY_ROOT/deploy.lock"
if ! flock -n 9; then
  echo "ERROR: another Questura deploy is running" >&2
  exit 1
fi

echo "==> Fetching origin/main"
git -C "$APP" fetch --prune origin main --quiet
git -C "$APP" reset --hard origin/main

# Dispatch through the freshly fetched copy. This keeps host bootstrap small
# while allowing deploy behaviour to evolve through reviewed repository PRs.
export QUESTURA_DEPLOY_LOCK_HELD=1
exec "$APP/apps/questura/infra/softprod/deploy.sh" "$@"
