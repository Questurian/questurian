#!/usr/bin/env bash
# Park the public site. Releases, config, Postgres, and Redis stay.
# Run on the Linux laptop. Resume with resume-live.sh.
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

echo "==> Parking live (public domains will go down)"
systemctl --user disable --now \
  questura-healthcheck.timer \
  questura-reconcile.timer \
  2>/dev/null || true
systemctl --user stop \
  questura-healthcheck.service \
  questura-reconcile.service \
  2>/dev/null || true
systemctl --user disable --now \
  questura-client \
  questura-server \
  questura-tunnel

date -u +'parked %FT%TZ' >"$DEPLOY_ROOT/LIVE_PARKED"
chmod 600 "$DEPLOY_ROOT/LIVE_PARKED"

echo "==> Parked. Postgres/Redis still running. Resume:"
echo "    ssh linux-laptop '~/questura/app/apps/questura/infra/softprod/resume-live.sh'"
echo "    (or the copy in this repo if that path is not on origin/main yet)"
