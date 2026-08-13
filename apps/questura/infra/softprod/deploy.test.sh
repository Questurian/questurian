#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

REPO="$TEST_ROOT/repo"
FAKE_BIN="$TEST_ROOT/bin"
DEPLOY_ROOT="$TEST_ROOT/host"
LOG="$TEST_ROOT/commands.log"
mkdir -p \
  "$REPO/apps/questura/infra/softprod" \
  "$REPO/apps/questura/apps/server/scripts/deploy" \
  "$REPO/apps/questura/apps/client" \
  "$FAKE_BIN" \
  "$DEPLOY_ROOT"
cp "$SCRIPT_DIR/deploy.sh" "$REPO/apps/questura/infra/softprod/deploy.sh"

git -C "$REPO" init --quiet
git -C "$REPO" config user.email deploy-test@example.invalid
git -C "$REPO" config user.name deploy-test
git -C "$REPO" add .
git -C "$REPO" commit --quiet -m fixture
git -C "$TEST_ROOT" init --quiet --bare --initial-branch=main origin.git
git -C "$REPO" branch -M main
git -C "$REPO" remote add origin "$TEST_ROOT/origin.git"
git -C "$REPO" push --quiet -u origin main

create_fake() {
  local command=$1
  local target="$FAKE_BIN/$command"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'set -eu' \
    'printf "%s|%s|%s\\n" "$PWD" "$(basename "$0")" "$*" >> "$DEPLOY_TEST_LOG"' \
    'if [[ $(basename "$0") == pnpm && $* == db:migrate && ${FAIL_MIGRATE:-0} == 1 ]]; then exit 42; fi' \
    'if [[ $(basename "$0") == flock && ${FAIL_FLOCK:-0} == 1 ]]; then exit 73; fi' \
    'if [[ $(basename "$0") == curl ]]; then' \
    '  if [[ " $* " == *" --write-out "* ]]; then printf 200; else printf '\''{"status":"healthy"}'\''; fi' \
    'fi' > "$target"
  chmod +x "$target"
}

for command in pnpm node systemctl curl flock; do
  create_fake "$command"
done

run_deploy() {
  env \
    PATH="$FAKE_BIN:$PATH" \
    NVM_DIR="$TEST_ROOT/no-nvm" \
    QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT" \
    QUESTURA_DEPLOY_LOCK_HELD="${DEPLOY_LOCK_HELD:-0}" \
    DEPLOY_TEST_LOG="$LOG" \
    FAIL_MIGRATE="${FAIL_MIGRATE:-0}" \
    FAIL_FLOCK="${FAIL_FLOCK:-0}" \
    "$REPO/apps/questura/infra/softprod/deploy.sh"
}

line_number() {
  local pattern=$1
  grep -n -m1 "$pattern" "$LOG" | cut -d: -f1
}

run_deploy > "$TEST_ROOT/success.out" 2> "$TEST_ROOT/success.err"

preflight=$(line_number 'node|scripts/deploy/check-pending-migrations.mjs$')
server_build=$(grep -n '/server|pnpm|build$' "$LOG" | cut -d: -f1)
server_test=$(line_number 'pnpm|test$')
server_lint=$(line_number 'pnpm|lint$')
migrate=$(line_number 'pnpm|db:migrate$')
clean=$(line_number 'node|scripts/deploy/check-pending-migrations.mjs --require-clean$')
restart=$(line_number 'systemctl|--user restart questura-server$')
server_public=$(line_number 'curl|.*https://cms.questurian.com/api/health')
client_build=$(grep -n '/client|pnpm|build$' "$LOG" | cut -d: -f1)
client_restart=$(line_number 'systemctl|--user restart questura-client$')
client_public=$(line_number 'curl|.*https://www.questurian.com/')

((server_build < server_test && server_test < server_lint && server_lint < preflight))
((preflight < migrate && migrate < clean && clean < restart))
((restart < server_public && server_public < client_build))
((client_build < client_restart && client_restart < client_public))
grep -q -- '--frozen-lockfile --prod=false' "$LOG"
grep -q 'Deployed ' "$TEST_ROOT/success.out"

: > "$LOG"
set +e
FAIL_MIGRATE=1 run_deploy > "$TEST_ROOT/failure.out" 2> "$TEST_ROOT/failure.err"
failure_code=$?
set -e

[[ $failure_code == 42 ]]
grep -q 'deploy failed during database migration' "$TEST_ROOT/failure.err"
if grep -q 'systemctl|--user restart' "$LOG"; then
  echo 'service restarted after failed migration' >&2
  exit 1
fi

: > "$LOG"
set +e
FAIL_FLOCK=1 run_deploy > "$TEST_ROOT/lock.out" 2> "$TEST_ROOT/lock.err"
lock_code=$?
set -e

[[ $lock_code == 1 ]]
grep -q 'another Questura deploy is running' "$TEST_ROOT/lock.err"
if grep -q 'pnpm|' "$LOG"; then
  echo 'deployment started without acquiring lock' >&2
  exit 1
fi

: > "$LOG"
env \
  PATH="$FAKE_BIN:$PATH" \
  NVM_DIR="$TEST_ROOT/no-nvm" \
  QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT" \
  QUESTURA_APP_ROOT="$REPO" \
  DEPLOY_TEST_LOG="$LOG" \
  "$SCRIPT_DIR/host-deploy-wrapper.sh" > "$TEST_ROOT/wrapper.out" 2> "$TEST_ROOT/wrapper.err"
grep -q '|flock|-n 9$' "$LOG"
grep -q 'Deployed ' "$TEST_ROOT/wrapper.out"

INSTALL_ROOT="$TEST_ROOT/install-host"
mkdir -p "$INSTALL_ROOT"
printf '%s\n' '#!/bin/sh' 'echo old' > "$INSTALL_ROOT/deploy.sh"
chmod 0700 "$INSTALL_ROOT/deploy.sh"
QUESTURA_DEPLOY_ROOT="$INSTALL_ROOT" \
  "$SCRIPT_DIR/install-deploy-wrapper.sh" > "$TEST_ROOT/install.out"
cmp "$SCRIPT_DIR/host-deploy-wrapper.sh" "$INSTALL_ROOT/deploy.sh"
[[ $(find "$INSTALL_ROOT/backups/deploy" -type f | wc -l | tr -d ' ') == 1 ]]
[[ $(stat -f '%Lp' "$INSTALL_ROOT/deploy.sh" 2>/dev/null || stat -c '%a' "$INSTALL_ROOT/deploy.sh") == 755 ]]

echo 'deploy sequencing tests passed'
