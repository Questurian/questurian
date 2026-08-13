#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CLIENT_CONFIG="$SCRIPT_DIR/../../apps/client/next.config.ts"
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

# Production preparation exports these before running the suite. Keep the
# fixture hermetic instead of accidentally targeting the real release root.
export QUESTURA_RELEASES_ROOT="$TEST_ROOT/inherited-releases-root"
export QUESTURA_RELEASE_SHA=ffffffffffffffffffffffffffffffffffffffff

REPO="$TEST_ROOT/repo"
FAKE_BIN="$TEST_ROOT/bin"
DEPLOY_ROOT="$TEST_ROOT/host"
CONFIG_ROOT="$DEPLOY_ROOT/config"
LOG="$TEST_ROOT/commands.log"
mkdir -p \
  "$REPO/apps/questura/infra/softprod" \
  "$REPO/apps/questura/apps/server/scripts/deploy" \
  "$REPO/apps/questura/apps/client" \
  "$FAKE_BIN" \
  "$CONFIG_ROOT"
cp \
  "$SCRIPT_DIR/deploy.sh" \
  "$SCRIPT_DIR/release-builder.sh" \
  "$SCRIPT_DIR/release-lib.sh" \
  "$REPO/apps/questura/infra/softprod/"
printf '%s\n' '{"name":"@questura/server"}' > "$REPO/apps/questura/apps/server/package.json"
printf '%s\n' 'export {}' > "$REPO/apps/questura/apps/server/scripts/deploy/check-pending-migrations.mjs"
printf '%s\n' '{"name":"@questura/client"}' > "$REPO/apps/questura/apps/client/package.json"

git -C "$REPO" init --quiet
git -C "$REPO" config user.email deploy-test@example.invalid
git -C "$REPO" config user.name deploy-test
git -C "$REPO" add .
git -C "$REPO" commit --quiet -m fixture
git -C "$TEST_ROOT" init --quiet --bare --initial-branch=main origin.git
git -C "$REPO" branch -M main
git -C "$REPO" remote add origin "$TEST_ROOT/origin.git"
git -C "$REPO" push --quiet -u origin main

printf '%s\n' 'DATABASE_URI=postgres://fixture' > "$CONFIG_ROOT/server.env"
printf '%s\n' 'NEXT_PUBLIC_SERVER_URL=https://cms.questurian.com' > "$CONFIG_ROOT/client.env"

create_fake() {
  local command=$1
  local target="$FAKE_BIN/$command"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'set -eu' \
    'printf "%s|%s|%s\\n" "$PWD" "$(basename "$0")" "$*" >> "$DEPLOY_TEST_LOG"' \
    'name=$(basename "$0")' \
    'if [[ $name == pnpm && $* == install* ]]; then mkdir -p "$PWD/node_modules/.pnpm/fake"; printf "certified dependency\\n" > "$PWD/node_modules/.pnpm/fake/runtime.js"; fi' \
    'if [[ $name == pnpm && $PWD == */server && $* == build && ${FAIL_SERVER_BUILD:-0} == 1 ]]; then exit 41; fi' \
    'if [[ $name == pnpm && $PWD == */server && $* == build && ${CHANGE_SERVER_CONFIG:-0} == 1 ]]; then printf "RACE=changed\\n" >> "$QUESTURA_CONFIG_ROOT/server.env"; fi' \
    'if [[ $name == pnpm && $PWD == */server && $* == build && ${CHANGE_CLIENT_CONFIG_DURING_SERVER_BUILD:-0} == 1 ]]; then printf "CROSS_RACE=changed\\n" >> "$QUESTURA_CONFIG_ROOT/client.env"; fi' \
    'if [[ $name == pnpm && $* == db:migrate && ${FAIL_MIGRATE:-0} == 1 ]]; then exit 42; fi' \
    'if [[ $name == node && $* == *--require-clean* && ${CHANGE_SERVER_CONFIG_AFTER_MIGRATION:-0} == 1 ]]; then printf "POST_MIGRATION_RACE=changed\\n" >> "$QUESTURA_CONFIG_ROOT/server.env"; fi' \
    'if [[ $name == pnpm && $PWD == */client && $* == build && ${FAIL_CLIENT_BUILD:-0} == 1 ]]; then exit 43; fi' \
    'if [[ $name == pnpm && $PWD == */client && $* == build && ${CHANGE_SERVER_CONFIG_DURING_CLIENT_BUILD:-0} == 1 ]]; then printf "CROSS_RACE=changed\\n" >> "$QUESTURA_CONFIG_ROOT/server.env"; fi' \
    'if [[ $name == pnpm && $PWD == */client && $* == build && ${SIGNAL_CLIENT_BUILD:-0} == 1 ]]; then kill -TERM "$PPID"; fi' \
    'if [[ $name == flock && ${FAIL_FLOCK:-0} == 1 ]]; then exit 73; fi' \
    'if [[ $name == systemctl && $* == *questura-client* && -n ${FAIL_CLIENT_ACTIVATION_SHA:-} ]]; then . "$QUESTURA_DEPLOY_ROOT/current-client/.env.release"; if [[ $QUESTURA_RELEASE_SHA == "$FAIL_CLIENT_ACTIVATION_SHA" && ! -e $QUESTURA_DEPLOY_ROOT/client-activation-failed ]]; then touch "$QUESTURA_DEPLOY_ROOT/client-activation-failed"; exit 75; fi; fi' \
    'if [[ $name == systemctl && $* == *questura-server* && -n ${FAIL_SERVER_RESTORE_SHA:-} ]]; then . "$QUESTURA_DEPLOY_ROOT/current-server/.env.release"; if [[ $QUESTURA_RELEASE_SHA == "$FAIL_SERVER_RESTORE_SHA" ]]; then exit 76; fi; fi' \
    'if [[ $name == curl ]]; then' \
    '  if [[ $* == *127.0.0.1:4000* || $* == *cms.questurian.com* ]]; then' \
    '    . "$QUESTURA_DEPLOY_ROOT/current-server/.env.release"' \
    '  else' \
    '    . "$QUESTURA_DEPLOY_ROOT/current-client/.env.release"' \
    '  fi' \
    '  printf '\''{"status":"healthy","releaseSha":"%s"}'\'' "$QUESTURA_RELEASE_SHA"' \
    'fi' > "$target"
  chmod +x "$target"
}

for command in pnpm node systemctl curl flock; do
  create_fake "$command"
done

grep -q 'isrFlushToDisk: false' "$CLIENT_CONFIG"

OLD_SHA=1111111111111111111111111111111111111111
OLD_RELEASE="$DEPLOY_ROOT/releases/$OLD_SHA/apps/questura/apps"
mkdir -p "$OLD_RELEASE/server" "$OLD_RELEASE/client"
printf 'QUESTURA_RELEASE_SHA=%s\n' "$OLD_SHA" > "$OLD_RELEASE/server/.env.release"
printf 'QUESTURA_RELEASE_SHA=%s\n' "$OLD_SHA" > "$OLD_RELEASE/client/.env.release"
ln -s "$OLD_RELEASE/server" "$DEPLOY_ROOT/current-server"
ln -s "$OLD_RELEASE/client" "$DEPLOY_ROOT/current-client"

run_deploy() {
  env \
    PATH="$FAKE_BIN:$PATH" \
    NVM_DIR="$TEST_ROOT/no-nvm" \
    QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT" \
    QUESTURA_RELEASES_ROOT="$DEPLOY_ROOT/releases" \
    QUESTURA_CONFIG_ROOT="$CONFIG_ROOT" \
    QUESTURA_HEALTH_ATTEMPTS=1 \
    QUESTURA_HEALTH_SLEEP_SECONDS=0 \
    QUESTURA_DEPLOY_LOCK_HELD="${DEPLOY_LOCK_HELD:-0}" \
    DEPLOY_TEST_LOG="$LOG" \
    FAIL_SERVER_BUILD="${FAIL_SERVER_BUILD:-0}" \
    CHANGE_SERVER_CONFIG="${CHANGE_SERVER_CONFIG:-0}" \
    CHANGE_CLIENT_CONFIG_DURING_SERVER_BUILD="${CHANGE_CLIENT_CONFIG_DURING_SERVER_BUILD:-0}" \
    FAIL_MIGRATE="${FAIL_MIGRATE:-0}" \
    CHANGE_SERVER_CONFIG_AFTER_MIGRATION="${CHANGE_SERVER_CONFIG_AFTER_MIGRATION:-0}" \
    FAIL_CLIENT_BUILD="${FAIL_CLIENT_BUILD:-0}" \
    CHANGE_SERVER_CONFIG_DURING_CLIENT_BUILD="${CHANGE_SERVER_CONFIG_DURING_CLIENT_BUILD:-0}" \
    SIGNAL_CLIENT_BUILD="${SIGNAL_CLIENT_BUILD:-0}" \
    FAIL_FLOCK="${FAIL_FLOCK:-0}" \
    FAIL_CLIENT_ACTIVATION_SHA="${FAIL_CLIENT_ACTIVATION_SHA:-}" \
    FAIL_SERVER_RESTORE_SHA="${FAIL_SERVER_RESTORE_SHA:-}" \
    "$REPO/apps/questura/infra/softprod/deploy.sh"
}

line_number() {
  local pattern=$1
  grep -n -m1 "$pattern" "$LOG" | cut -d: -f1
}

FIRST_SHA=$(git -C "$REPO" rev-parse HEAD)
FIRST_RELEASE="$DEPLOY_ROOT/releases/$FIRST_SHA"

# Mismatched current pair aborts before release preparation or migration.
MISMATCH_SHA=3333333333333333333333333333333333333333
MISMATCH_CLIENT="$DEPLOY_ROOT/releases/$MISMATCH_SHA/apps/questura/apps/client"
mkdir -p "$MISMATCH_CLIENT"
printf 'QUESTURA_RELEASE_SHA=%s\n' "$MISMATCH_SHA" > "$MISMATCH_CLIENT/.env.release"
ln -sfn "$MISMATCH_CLIENT" "$DEPLOY_ROOT/current-client"
: > "$LOG"
set +e
run_deploy > "$TEST_ROOT/mismatch.out" 2> "$TEST_ROOT/mismatch.err"
mismatch_code=$?
set -e
[[ $mismatch_code == 1 ]]
grep -q 'current client/server releases are mismatched' "$TEST_ROOT/mismatch.err"
if grep -Eq '\|(pnpm|node)\|' "$LOG"; then
  echo 'mismatched current pair reached build or migration' >&2
  exit 1
fi
ln -sfn "$OLD_RELEASE/client" "$DEPLOY_ROOT/current-client"
: > "$LOG"

mkdir -p "$REPO/apps/questura/apps/server/.next"
printf '%s\n' secret-sentinel > "$REPO/apps/questura/apps/server/.env.untracked"
printf '%s\n' stale-build > "$REPO/apps/questura/apps/server/.next/stale"
if ! run_deploy > "$TEST_ROOT/success.out" 2> "$TEST_ROOT/success.err"; then
  echo 'initial release deployment failed:' >&2
  tail -40 "$TEST_ROOT/success.err" >&2
  exit 1
fi

install_line=$(line_number 'releases/.staging-.*|pnpm|install ')
server_build=$(line_number 'releases/.staging-.*/apps/questura/apps/server|pnpm|build$')
server_test=$(line_number '|pnpm|test$')
server_lint=$(line_number '|pnpm|lint$')
preflight=$(line_number 'node|scripts/deploy/check-pending-migrations.mjs$')
migrate=$(line_number 'pnpm|db:migrate$')
clean=$(line_number 'node|scripts/deploy/check-pending-migrations.mjs --require-clean$')
server_restart=$(line_number 'systemctl|--user restart questura-server$')
server_public=$(line_number 'curl|.*https://cms.questurian.com/api/health')
client_build=$(line_number "$FIRST_RELEASE/apps/questura/apps/client|pnpm|build$")
client_restart=$(line_number 'systemctl|--user restart questura-client$')
client_public=$(line_number 'curl|.*https://www.questurian.com/api/health')

((install_line < server_build && server_build < server_test && server_test < server_lint))
((server_lint < preflight && preflight < migrate && migrate < clean))
((clean < server_restart && server_restart < server_public && server_public < client_build))
((client_build < client_restart && client_restart < client_public))
grep -q -- '--frozen-lockfile --prod=false' "$LOG"
grep -q "QUESTURA_RELEASE_SHA=$FIRST_SHA" "$FIRST_RELEASE/.questura/server-ready"
grep -q "QUESTURA_RELEASE_SHA=$FIRST_SHA" "$FIRST_RELEASE/.questura/release-ready"
[[ ! -e $FIRST_RELEASE/apps/questura/apps/server/.env.untracked ]]
[[ ! -e $FIRST_RELEASE/apps/questura/apps/server/.next/stale ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-server") == "$FIRST_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-client") == "$FIRST_RELEASE/apps/questura/apps/client" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$FIRST_RELEASE/apps/questura/apps/server/.env") == "$CONFIG_ROOT/server.env" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$FIRST_RELEASE/apps/questura/apps/client/.env.production.local") == "$CONFIG_ROOT/client.env" ]]
grep -q "Deployed $FIRST_SHA" "$TEST_ROOT/success.out"

# Same commit is immutable: verify exact health without rebuilding or restarting.
: > "$LOG"
run_deploy > "$TEST_ROOT/repeat.out" 2> "$TEST_ROOT/repeat.err"
if grep -Eq '\|(pnpm|node)\||restart questura-' "$LOG"; then
  echo 'same-SHA deploy mutated active release' >&2
  tail -40 "$LOG" >&2
  exit 1
fi
grep -q "Already deployed $FIRST_SHA" "$TEST_ROOT/repeat.out"

# Normal Next runtime cache writes do not invalidate immutable code/artifacts.
mkdir -p "$FIRST_RELEASE/apps/questura/apps/server/.next/cache/runtime"
printf '%s\n' mutable-cache > "$FIRST_RELEASE/apps/questura/apps/server/.next/cache/runtime/value"
mkdir -p "$FIRST_RELEASE/apps/questura/apps/client/.next/cache/images"
printf '%s\n' mutable-cache > "$FIRST_RELEASE/apps/questura/apps/client/.next/cache/images/value"
: > "$LOG"
run_deploy > "$TEST_ROOT/cache-repeat.out" 2> "$TEST_ROOT/cache-repeat.err"
grep -q "Already deployed $FIRST_SHA" "$TEST_ROOT/cache-repeat.out"

# Runtime dependency mutation invalidates release certification.
printf '%s\n' corrupted > "$FIRST_RELEASE/node_modules/.pnpm/fake/runtime.js"
set +e
run_deploy > "$TEST_ROOT/dependency-corrupt.out" 2> "$TEST_ROOT/dependency-corrupt.err"
dependency_corrupt_code=$?
set -e
[[ $dependency_corrupt_code == 1 ]]
grep -q 'state does not match commit/config/artifacts/dependencies' "$TEST_ROOT/dependency-corrupt.err"
printf '%s\n' 'certified dependency' > "$FIRST_RELEASE/node_modules/.pnpm/fake/runtime.js"

# Published artifact mutation invalidates marker and prevents reuse.
printf '%s\n' corrupted >> "$FIRST_RELEASE/apps/questura/apps/server/package.json"
set +e
run_deploy > "$TEST_ROOT/corrupt.out" 2> "$TEST_ROOT/corrupt.err"
corrupt_code=$?
set -e
[[ $corrupt_code == 1 ]]
grep -q 'state does not match commit/config/artifacts/dependencies' "$TEST_ROOT/corrupt.err"
cp "$REPO/apps/questura/apps/server/package.json" "$FIRST_RELEASE/apps/questura/apps/server/package.json"

# A reused commit cannot silently embed changed build-time env.
printf '%s\n' 'NEXT_PUBLIC_SERVER_URL=https://changed.example' > "$CONFIG_ROOT/client.env"
set +e
run_deploy > "$TEST_ROOT/env-drift.out" 2> "$TEST_ROOT/env-drift.err"
env_drift_code=$?
set -e
[[ $env_drift_code == 1 ]]
grep -q 'new commit before deploying config changes' "$TEST_ROOT/env-drift.err"
printf '%s\n' 'NEXT_PUBLIC_SERVER_URL=https://cms.questurian.com' > "$CONFIG_ROOT/client.env"

# Failed staged build is removed without publishing or touching live links.
printf '%s\n' failed-build > "$REPO/release-fixture.txt"
git -C "$REPO" add release-fixture.txt
git -C "$REPO" commit --quiet -m failed-build
FAILED_BUILD_SHA=$(git -C "$REPO" rev-parse HEAD)
: > "$LOG"
set +e
FAIL_SERVER_BUILD=1 run_deploy > "$TEST_ROOT/server-build-failure.out" 2> "$TEST_ROOT/server-build-failure.err"
server_build_code=$?
set -e
[[ $server_build_code == 41 ]]
[[ ! -e $DEPLOY_ROOT/releases/$FAILED_BUILD_SHA ]]
[[ -z $(find "$DEPLOY_ROOT/releases" -maxdepth 1 -name '.staging-*' -print -quit) ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-server") == "$FIRST_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-client") == "$FIRST_RELEASE/apps/questura/apps/client" ]]

# Config drift during build prevents release certification/publication.
printf '%s\n' config-race > "$REPO/release-fixture.txt"
git -C "$REPO" add release-fixture.txt
git -C "$REPO" commit --quiet -m config-race
CONFIG_RACE_SHA=$(git -C "$REPO" rev-parse HEAD)
: > "$LOG"
set +e
CHANGE_SERVER_CONFIG=1 run_deploy > "$TEST_ROOT/config-race.out" 2> "$TEST_ROOT/config-race.err"
config_race_code=$?
set -e
[[ $config_race_code == 1 ]]
grep -q 'release inputs changed' "$TEST_ROOT/config-race.err"
[[ ! -e $DEPLOY_ROOT/releases/$CONFIG_RACE_SHA ]]
[[ -z $(find "$DEPLOY_ROOT/releases" -maxdepth 1 -name '.staging-*' -print -quit) ]]
printf '%s\n' 'DATABASE_URI=postgres://fixture' > "$CONFIG_ROOT/server.env"

# Reciprocal client-config drift during server build also blocks publication.
printf '%s\n' cross-config-race > "$REPO/release-fixture.txt"
git -C "$REPO" add release-fixture.txt
git -C "$REPO" commit --quiet -m cross-config-race
CROSS_CONFIG_RACE_SHA=$(git -C "$REPO" rev-parse HEAD)
set +e
CHANGE_CLIENT_CONFIG_DURING_SERVER_BUILD=1 run_deploy > "$TEST_ROOT/cross-config-race.out" 2> "$TEST_ROOT/cross-config-race.err"
cross_config_code=$?
set -e
[[ $cross_config_code == 1 ]]
grep -q 'release inputs changed' "$TEST_ROOT/cross-config-race.err"
[[ ! -e $DEPLOY_ROOT/releases/$CROSS_CONFIG_RACE_SHA ]]
printf '%s\n' 'NEXT_PUBLIC_SERVER_URL=https://cms.questurian.com' > "$CONFIG_ROOT/client.env"

# New target migration failure leaves both components on previous release.
printf '%s\n' second > "$REPO/release-fixture.txt"
git -C "$REPO" add release-fixture.txt
git -C "$REPO" commit --quiet -m second
SECOND_SHA=$(git -C "$REPO" rev-parse HEAD)
SECOND_RELEASE="$DEPLOY_ROOT/releases/$SECOND_SHA"
: > "$LOG"
set +e
FAIL_MIGRATE=1 run_deploy > "$TEST_ROOT/migrate-failure.out" 2> "$TEST_ROOT/migrate-failure.err"
migrate_code=$?
set -e

[[ $migrate_code == 42 ]]
grep -q 'deploy failed during database migration' "$TEST_ROOT/migrate-failure.err"
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-server") == "$FIRST_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-client") == "$FIRST_RELEASE/apps/questura/apps/client" ]]
if grep -q 'systemctl|--user restart' "$LOG"; then
  echo 'service restarted after failed migration' >&2
  exit 1
fi

# Config drift after migration is rechecked immediately before activation.
: > "$LOG"
set +e
CHANGE_SERVER_CONFIG_AFTER_MIGRATION=1 run_deploy > "$TEST_ROOT/post-migration-race.out" 2> "$TEST_ROOT/post-migration-race.err"
post_migration_code=$?
set -e
[[ $post_migration_code == 1 ]]
grep -q 'release inputs changed' "$TEST_ROOT/post-migration-race.err"
if grep -q 'restart questura-server' "$LOG"; then
  echo 'server activated after post-migration config drift' >&2
  exit 1
fi
printf '%s\n' 'DATABASE_URI=postgres://fixture' > "$CONFIG_ROOT/server.env"

# Client build failure compensates target server; old pair remains aligned.
: > "$LOG"
set +e
FAIL_CLIENT_BUILD=1 run_deploy > "$TEST_ROOT/client-failure.out" 2> "$TEST_ROOT/client-failure.err"
client_code=$?
set -e

[[ $client_code == 43 ]]
grep -q 'deploy failed during client build' "$TEST_ROOT/client-failure.err"
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-server") == "$FIRST_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-client") == "$FIRST_RELEASE/apps/questura/apps/client" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/previous-server") == "$OLD_RELEASE/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/previous-client") == "$OLD_RELEASE/client" ]]
grep -q 'Current links after reconciliation' "$TEST_ROOT/client-failure.err"

# Partial release remains bound to original build-time config on retry.
printf '%s\n' 'NEXT_PUBLIC_SERVER_URL=https://changed.example' > "$CONFIG_ROOT/client.env"
set +e
run_deploy > "$TEST_ROOT/partial-env-drift.out" 2> "$TEST_ROOT/partial-env-drift.err"
partial_env_code=$?
set -e
[[ $partial_env_code == 1 ]]
grep -q 'release inputs changed' "$TEST_ROOT/partial-env-drift.err"
printf '%s\n' 'NEXT_PUBLIC_SERVER_URL=https://cms.questurian.com' > "$CONFIG_ROOT/client.env"

# Retry reuses published server artifact, migrates, then completes client.
: > "$LOG"
run_deploy > "$TEST_ROOT/resume.out" 2> "$TEST_ROOT/resume.err"
if grep -Eq '\|pnpm\|install |/server\|pnpm\|(build|test|lint)' "$LOG"; then
  echo 'partial deploy retry rebuilt published server release' >&2
  exit 1
fi
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-server") == "$SECOND_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-client") == "$SECOND_RELEASE/apps/questura/apps/client" ]]

# Client activation failure restores pair and preserves paired rollback history.
printf '%s\n' third > "$REPO/release-fixture.txt"
git -C "$REPO" add release-fixture.txt
git -C "$REPO" commit --quiet -m third
THIRD_SHA=$(git -C "$REPO" rev-parse HEAD)

# Reciprocal server-config drift during client build blocks client activation.
: > "$LOG"
set +e
CHANGE_SERVER_CONFIG_DURING_CLIENT_BUILD=1 run_deploy > "$TEST_ROOT/client-cross-race.out" 2> "$TEST_ROOT/client-cross-race.err"
client_cross_code=$?
set -e
[[ $client_cross_code == 1 ]]
grep -q 'release inputs changed' "$TEST_ROOT/client-cross-race.err"
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-server") == "$SECOND_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-client") == "$SECOND_RELEASE/apps/questura/apps/client" ]]
printf '%s\n' 'DATABASE_URI=postgres://fixture' > "$CONFIG_ROOT/server.env"

# TERM during post-activation client build restores original pair and history.
: > "$LOG"
set +e
SIGNAL_CLIENT_BUILD=1 run_deploy > "$TEST_ROOT/client-signal.out" 2> "$TEST_ROOT/client-signal.err"
client_signal_code=$?
set -e
[[ $client_signal_code == 143 ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-server") == "$SECOND_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-client") == "$SECOND_RELEASE/apps/questura/apps/client" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/previous-server") == "$FIRST_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/previous-client") == "$FIRST_RELEASE/apps/questura/apps/client" ]]

: > "$LOG"
set +e
FAIL_CLIENT_ACTIVATION_SHA="$THIRD_SHA" run_deploy > "$TEST_ROOT/client-activation.out" 2> "$TEST_ROOT/client-activation.err"
client_activation_code=$?
set -e
[[ $client_activation_code == 1 ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-server") == "$SECOND_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-client") == "$SECOND_RELEASE/apps/questura/apps/client" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/previous-server") == "$FIRST_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/previous-client") == "$FIRST_RELEASE/apps/questura/apps/client" ]]

# Compensation failure is loud, nonzero, and reports actual current links.
printf '%s\n' fourth > "$REPO/release-fixture.txt"
git -C "$REPO" add release-fixture.txt
git -C "$REPO" commit --quiet -m fourth
: > "$LOG"
set +e
FAIL_CLIENT_BUILD=1 FAIL_SERVER_RESTORE_SHA="$SECOND_SHA" run_deploy > "$TEST_ROOT/compensation.out" 2> "$TEST_ROOT/compensation.err"
compensation_code=$?
set -e
[[ $compensation_code == 43 ]]
grep -q 'CRITICAL: original server restoration failed' "$TEST_ROOT/compensation.err"
grep -q 'Current links after reconciliation' "$TEST_ROOT/compensation.err"
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-server") == "$SECOND_RELEASE/apps/questura/apps/server" ]]
[[ $(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DEPLOY_ROOT/current-client") == "$SECOND_RELEASE/apps/questura/apps/client" ]]

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

# Stable wrapper holds lock, syncs main, and dispatches reviewed deploy script.
: > "$LOG"
env \
  PATH="$FAKE_BIN:$PATH" \
  NVM_DIR="$TEST_ROOT/no-nvm" \
  QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT" \
  QUESTURA_RELEASES_ROOT="$DEPLOY_ROOT/releases" \
  QUESTURA_CONFIG_ROOT="$CONFIG_ROOT" \
  QUESTURA_HEALTH_ATTEMPTS=1 \
  QUESTURA_HEALTH_SLEEP_SECONDS=0 \
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
[[ $(stat -c '%a' "$INSTALL_ROOT/deploy.sh" 2>/dev/null || stat -f '%Lp' "$INSTALL_ROOT/deploy.sh") == 755 ]]

echo 'deploy sequencing tests passed'
