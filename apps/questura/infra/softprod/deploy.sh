#!/usr/bin/env bash
# Build and restart Questura soft production from an already-synced checkout.
# Use host-deploy-wrapper.sh as the host entry point so code sync happens first.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
DEPLOY_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}
QUESTURA_APPS="$REPO_ROOT/apps/questura/apps"
SERVER="$QUESTURA_APPS/server"
CLIENT="$QUESTURA_APPS/client"
stage=initialization

report_failure() {
  local exit_code=$?
  echo "ERROR: deploy failed during $stage (exit $exit_code)" >&2
  exit "$exit_code"
}
trap report_failure ERR

if (($# > 0)); then
  echo "ERROR: deploy.sh takes no arguments" >&2
  exit 2
fi

if [[ ${QUESTURA_DEPLOY_LOCK_HELD:-0} != 1 ]]; then
  exec 9>"$DEPLOY_ROOT/deploy.lock"
  if ! flock -n 9; then
    echo "ERROR: another Questura deploy is running" >&2
    exit 1
  fi
fi

if ! git -C "$REPO_ROOT" diff --quiet || ! git -C "$REPO_ROOT" diff --cached --quiet; then
  echo "ERROR: deployment checkout has tracked changes" >&2
  exit 1
fi

export NVM_DIR=${NVM_DIR:-"$HOME/.nvm"}
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use "${QUESTURA_NODE_VERSION:-22}" >/dev/null
fi

wait_for_healthy_server() {
  local label=$1
  local url=$2
  local attempt body

  for attempt in $(seq 1 30); do
    body=$(curl --fail --silent --show-error --max-time 10 "$url" 2>/dev/null || true)
    if [[ $body =~ \"status\"[[:space:]]*:[[:space:]]*\"healthy\" ]]; then
      echo "    $label healthy"
      return 0
    fi
    sleep 3
  done

  echo "ERROR: $label never became healthy: $url" >&2
  return 1
}

wait_for_http_200() {
  local label=$1
  local url=$2
  local attempt code

  for attempt in $(seq 1 30); do
    code=$(curl --location --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "$url" || true)
    if [[ $code == 200 ]]; then
      echo "    $label reachable"
      return 0
    fi
    sleep 3
  done

  echo "ERROR: $label never returned HTTP 200: $url" >&2
  return 1
}

stage="dependency installation"
echo "==> Installing locked dependencies (Questura workspaces only)"
cd "$REPO_ROOT"
pnpm install --frozen-lockfile --prod=false \
  --filter "@questura/server..." \
  --filter "@questura/client..."

stage="server build"
echo "==> Building server"
cd "$SERVER"
pnpm build

stage="server tests"
echo "==> Testing server"
pnpm test

stage="server lint"
echo "==> Linting server"
pnpm lint

stage="migration preflight"
echo "==> Checking pending database migrations"
node scripts/deploy/check-pending-migrations.mjs

stage="database migration"
echo "==> Running database migrations"
pnpm db:migrate
node scripts/deploy/check-pending-migrations.mjs --require-clean

stage="server restart"
echo "==> Restarting server"
systemctl --user restart questura-server
stage="server health checks"
wait_for_healthy_server "local server" "http://127.0.0.1:4000/api/health"
wait_for_healthy_server "public server" "https://cms.questurian.com/api/health"

# Client statically prerenders /articles from its public backend URL. Build only
# after the new server is reachable through the Cloudflare tunnel.
stage="client build"
echo "==> Building client"
cd "$CLIENT"
pnpm build

stage="client restart"
echo "==> Restarting client"
systemctl --user restart questura-client
stage="client health checks"
wait_for_http_200 "local client" "http://127.0.0.1:3000/"
wait_for_http_200 "public client" "https://www.questurian.com/"

stage="unit status check"
echo "==> Unit status"
systemctl --user is-active questura-server questura-client questura-tunnel
echo "Deployed $(git -C "$REPO_ROOT" rev-parse --short HEAD)."
