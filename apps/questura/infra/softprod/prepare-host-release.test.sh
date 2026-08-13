#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

# Production preparation exports these before running the suite. Keep this
# fixture bound to its temporary host even under that inherited environment.
export QUESTURA_RELEASES_ROOT="$TEST_ROOT/inherited-releases-root"
export QUESTURA_RELEASE_SHA=ffffffffffffffffffffffffffffffffffffffff

REPO="$TEST_ROOT/repo"
DEPLOY_ROOT="$TEST_ROOT/host"
CONFIG_ROOT="$DEPLOY_ROOT/config"
FAKE_BIN="$TEST_ROOT/bin"
LOG="$TEST_ROOT/commands.log"
mkdir -p \
  "$REPO/apps/questura/infra/softprod" \
  "$REPO/apps/questura/apps/server/scripts/deploy" \
  "$REPO/apps/questura/apps/client" \
  "$CONFIG_ROOT" \
  "$FAKE_BIN"
cp \
  "$SCRIPT_DIR/prepare-host-release.sh" \
  "$SCRIPT_DIR/release-builder.sh" \
  "$SCRIPT_DIR/release-lib.sh" \
  "$REPO/apps/questura/infra/softprod/"
printf '%s\n' '{"name":"@questura/server"}' > "$REPO/apps/questura/apps/server/package.json"
printf '%s\n' 'export {}' > "$REPO/apps/questura/apps/server/scripts/deploy/check-pending-migrations.mjs"
printf '%s\n' '{"name":"@questura/client"}' > "$REPO/apps/questura/apps/client/package.json"
printf '%s\n' 'DATABASE_URI=postgres://fixture' > "$CONFIG_ROOT/server.env"
printf '%s\n' 'NEXT_PUBLIC_SERVER_URL=https://cms.questurian.com' > "$CONFIG_ROOT/client.env"

git -C "$REPO" init --quiet
git -C "$REPO" config user.email prepare-test@example.invalid
git -C "$REPO" config user.name prepare-test
git -C "$REPO" add .
git -C "$REPO" commit --quiet -m fixture

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -eu' \
  'printf "%s|%s|%s\\n" "$PWD" "$(basename "$0")" "$*" >> "$PREPARE_TEST_LOG"' \
  'if [[ $(basename "$0") == pnpm && $* == install* ]]; then mkdir -p "$PWD/node_modules/.pnpm/fake"; printf "dependency\\n" > "$PWD/node_modules/.pnpm/fake/runtime.js"; fi' \
  'if [[ $(basename "$0") == pnpm && $* == db:migrate && ${FAIL_MIGRATE:-0} == 1 ]]; then exit 42; fi' > "$FAKE_BIN/pnpm"
cp "$FAKE_BIN/pnpm" "$FAKE_BIN/node"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ ${FAIL_FLOCK:-0} == 1 ]]; then exit 73; fi' > "$FAKE_BIN/flock"
chmod +x "$FAKE_BIN"/*

run_prepare() {
  env \
    PATH="$FAKE_BIN:$PATH" \
    NVM_DIR="$TEST_ROOT/no-nvm" \
    QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT" \
    QUESTURA_RELEASES_ROOT="$DEPLOY_ROOT/releases" \
    QUESTURA_CONFIG_ROOT="$CONFIG_ROOT" \
    PREPARE_TEST_LOG="$LOG" \
    FAIL_MIGRATE="${FAIL_MIGRATE:-0}" \
    FAIL_FLOCK="${FAIL_FLOCK:-0}" \
    "$REPO/apps/questura/infra/softprod/prepare-host-release.sh"
}

SHA=$(git -C "$REPO" rev-parse HEAD)
RELEASE="$DEPLOY_ROOT/releases/$SHA"
run_prepare > "$TEST_ROOT/success.out" 2> "$TEST_ROOT/success.err"
grep -q "Prepared release $SHA" "$TEST_ROOT/success.out"
grep -q "QUESTURA_RELEASE_SHA=$SHA" "$RELEASE/.questura/server-ready"
grep -q "QUESTURA_RELEASE_SHA=$SHA" "$RELEASE/.questura/release-ready"
[[ ! -e $DEPLOY_ROOT/current-server && ! -e $DEPLOY_ROOT/current-client ]]
if rg -q 'systemctl|docker|cloudflared' "$LOG"; then
  echo 'initial release preparation touched active host services' >&2
  exit 1
fi
preflight=$(grep -n 'node|scripts/deploy/check-pending-migrations.mjs$' "$LOG" | cut -d: -f1)
migrate=$(grep -n 'pnpm|db:migrate$' "$LOG" | cut -d: -f1)
client_build=$(grep -n '/client|pnpm|build$' "$LOG" | cut -d: -f1)
((preflight < migrate && migrate < client_build))

# Complete release retry validates and reruns migration clean check, not builds.
: > "$LOG"
run_prepare > "$TEST_ROOT/repeat.out" 2> "$TEST_ROOT/repeat.err"
if grep -Eq '\|pnpm\|(install |build$|test$|lint$)' "$LOG"; then
  echo 'complete initial release was rebuilt on retry' >&2
  exit 1
fi

# Migration failure leaves release inactive and never runs client build.
printf '%s\n' next > "$REPO/fixture.txt"
git -C "$REPO" add fixture.txt
git -C "$REPO" commit --quiet -m next
NEXT_SHA=$(git -C "$REPO" rev-parse HEAD)
: > "$LOG"
set +e
FAIL_MIGRATE=1 run_prepare > "$TEST_ROOT/migrate.out" 2> "$TEST_ROOT/migrate.err"
migrate_code=$?
set -e
[[ $migrate_code == 42 ]]
grep -q 'failed during database migration' "$TEST_ROOT/migrate.err"
[[ ! -e $DEPLOY_ROOT/current-server && ! -e $DEPLOY_ROOT/current-client ]]
if grep -q '/client|pnpm|build$' "$LOG"; then
  echo 'client built after migration failure' >&2
  exit 1
fi
[[ -f $DEPLOY_ROOT/releases/$NEXT_SHA/.questura/server-ready ]]
[[ ! -f $DEPLOY_ROOT/releases/$NEXT_SHA/.questura/release-ready ]]

set +e
FAIL_FLOCK=1 run_prepare > "$TEST_ROOT/lock.out" 2> "$TEST_ROOT/lock.err"
lock_code=$?
set -e
[[ $lock_code == 1 ]]
grep -q 'another Questura deploy or host operation is running' "$TEST_ROOT/lock.err"

# Existing or dangling release links abort after lock, before build/migration.
ln -s "$DEPLOY_ROOT/releases/missing" "$DEPLOY_ROOT/current-server"
: > "$LOG"
set +e
run_prepare > "$TEST_ROOT/current-link.out" 2> "$TEST_ROOT/current-link.err"
current_link_code=$?
set -e
[[ $current_link_code == 1 ]]
grep -q 'current release links already exist' "$TEST_ROOT/current-link.err"
if grep -Eq '\|(pnpm|node)\|' "$LOG"; then
  echo 'initial preparation continued after current-link guard' >&2
  exit 1
fi

echo 'initial release preparation tests passed'
