#!/usr/bin/env bash
# Bring the public site back. Does not deploy a new SHA; starts the parked units.
# Run on the Linux laptop. If main has moved, run ~/questura/deploy.sh after this.
set -Eeuo pipefail

DEPLOY_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}

if [[ ! -d $DEPLOY_ROOT/config ]]; then
  echo "ERROR: run this on the Linux laptop (missing $DEPLOY_ROOT/config)" >&2
  exit 1
fi

exec 9>"$DEPLOY_ROOT/deploy.lock"
if ! flock -n 9; then
  echo "ERROR: another Questura deploy is running" >&2
  exit 1
fi

echo "==> Resuming live"
systemctl --user enable --now questura-server
systemctl --user enable --now questura-client
systemctl --user enable --now questura-tunnel
systemctl --user enable --now questura-healthcheck.timer
systemctl --user enable --now questura-reconcile.timer
rm -f "$DEPLOY_ROOT/LIVE_PARKED"

echo "==> Live units enabled. Check:"
echo "    curl -sS --max-time 12 https://cms.questurian.com/api/health"
echo "    curl -sS --max-time 12 https://www.questurian.com/api/health"
echo "If origin/main is ahead of the parked release, run ~/questura/deploy.sh"
