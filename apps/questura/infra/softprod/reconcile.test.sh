#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# Canonicalised, because reconcile.sh resolves `current-server` through
# `canonical_path` and on macOS /var is itself a symlink to /private/var.
TEST_ROOT=$(cd -- "$(mktemp -d)" && pwd -P)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

DEPLOY_ROOT="$TEST_ROOT/host"
RELEASES_ROOT="$DEPLOY_ROOT/releases"
CONFIG_ROOT="$DEPLOY_ROOT/config"
REPORTS_ROOT="$DEPLOY_ROOT/reports"
FAKE_BIN="$TEST_ROOT/bin"
LOG="$TEST_ROOT/commands.log"
# Planted in server.env so the report can be proven not to echo the environment
# back. Report files are 0600 but they are still files on a laptop's disk.
SECRET_SENTINEL='rk_live_reconcile-secret-never-print'
mkdir -p "$RELEASES_ROOT" "$CONFIG_ROOT" "$FAKE_BIN"
: > "$DEPLOY_ROOT/deploy.lock"

printf '%s\n' \
  "STRIPE_SECRET_KEY=$SECRET_SENTINEL" \
  'DATABASE_URI=postgres://questura:also-secret@127.0.0.1:5433/questura' > "$CONFIG_ROOT/server.env"
chmod 0600 "$CONFIG_ROOT/server.env"

RELEASE_SHA=1111111111111111111111111111111111111111
SERVER_RELEASE="$RELEASES_ROOT/$RELEASE_SHA/apps/questura/apps/server"
mkdir -p "$SERVER_RELEASE/scripts"
printf 'QUESTURA_RELEASE_SHA=%s\n' "$RELEASE_SHA" > "$SERVER_RELEASE/.env.release"
ln -s "$SERVER_RELEASE" "$DEPLOY_ROOT/current-server"

# Stands in for the orchestrator. Records that it was reached with the release as
# its working directory and with the environment sourced, prints a plausible
# report, and exits with whatever the case under test asked for. It deliberately
# never prints the secret it received — that is what the report is asserted on.
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -u' \
  'printf "pnpm|%s|cwd=%s|apply=%s|max_apply=%s|key=%s\\n" \' \
  '  "$*" "$PWD" "${QUESTURA_RECONCILE_APPLY:-unset}" "${QUESTURA_RECONCILE_MAX_APPLY:-unset}" \' \
  '  "${STRIPE_SECRET_KEY:+present}" >> "$RECONCILE_TEST_LOG"' \
  'printf "RECONCILE result=%s exit=%s\\n" "${CHILD_RESULT:-ok}" "${CHILD_STATUS:-0}"' \
  'printf "%s\\n" "detail line for <visitor@example.invalid>"' \
  'exit "${CHILD_STATUS:-0}"' > "$FAKE_BIN/pnpm"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -u' \
  'printf "flock|%s\\n" "$*" >> "$RECONCILE_TEST_LOG"' \
  'if [[ ${LOCK_BUSY:-0} == 1 ]]; then exit 1; fi' \
  'exit 0' > "$FAKE_BIN/flock"
chmod +x "$FAKE_BIN"/*

run_reconcile() {
  env \
    PATH="$FAKE_BIN:$PATH" \
    QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT" \
    QUESTURA_RELEASES_ROOT="$RELEASES_ROOT" \
    QUESTURA_CONFIG_ROOT="$CONFIG_ROOT" \
    QUESTURA_REPORTS_ROOT="$REPORTS_ROOT" \
    QUESTURA_RECONCILE_LOCK_WAIT_SECONDS=1 \
    QUESTURA_RECONCILE_REPORT_RETENTION_DAYS="${RETENTION_DAYS:-30}" \
    RECONCILE_TEST_LOG="$LOG" \
    LOCK_BUSY="${LOCK_BUSY:-0}" \
    CHILD_STATUS="${CHILD_STATUS:-0}" \
    CHILD_RESULT="${CHILD_RESULT:-ok}" \
    "$SCRIPT_DIR/reconcile.sh"
}

expect_exit() {
  local expected=$1
  local output=$2
  shift 2
  set +e
  "$@" > "$output" 2>&1
  local code=$?
  set -e
  if [[ $code != "$expected" ]]; then
    echo "expected exit $expected, got $code:" >&2
    tail -20 "$output" >&2
    exit 1
  fi
}

status_field() {
  sed -n "s/.*$1=\([^ ]*\).*/\1/p" "$REPORTS_ROOT/reconcile-status"
}

# A clean run writes the dated report, the latest symlink, and the status file,
# and reaches the orchestrator from inside the release with the env sourced.
: > "$LOG"
run_reconcile > "$TEST_ROOT/clean.out" 2>&1
TODAY=$(date -u +%Y-%m-%d)
REPORT="$REPORTS_ROOT/reconcile-$TODAY.log"
grep -q "OK check=reconcile exit=0 release_sha=$RELEASE_SHA" "$TEST_ROOT/clean.out"
grep -Fq "pnpm|exec tsx scripts/nightly-stripe-reconcile.ts|cwd=$SERVER_RELEASE|apply=1|max_apply=25|key=present" "$LOG"
[[ -f $REPORT ]]
grep -q 'RECONCILE result=ok exit=0' "$REPORT"
grep -Fq "=== reconcile start utc=" "$REPORT"
[[ $(readlink "$REPORTS_ROOT/reconcile-latest.log") == "$REPORT" ]]
[[ $(status_field status) == ok ]]
[[ $(status_field exit) == 0 ]]
[[ $(status_field finished_at) =~ ^[0-9]+$ ]]

# Reports contain visitor identifiers, so their directory and files are private
# and the secret from server.env never lands in either.
[[ $(stat -f '%Lp' "$REPORTS_ROOT" 2>/dev/null || stat -c '%a' "$REPORTS_ROOT") == 700 ]]
[[ $(stat -f '%Lp' "$REPORT" 2>/dev/null || stat -c '%a' "$REPORT") == 600 ]]
[[ $(stat -f '%Lp' "$REPORTS_ROOT/reconcile-status" 2>/dev/null || stat -c '%a' "$REPORTS_ROOT/reconcile-status") == 600 ]]
! grep -Fq "$SECRET_SENTINEL" "$REPORT"
! grep -Fq "$SECRET_SENTINEL" "$TEST_ROOT/clean.out"
! grep -Fq 'also-secret' "$REPORT"

# The same UTC day appends rather than truncating, so a manual re-run after a
# failure cannot erase the first run's evidence.
run_reconcile > /dev/null 2>&1
[[ $(grep -c '^=== reconcile start' "$REPORT") == 2 ]]

# A non-zero orchestrator exit propagates and is recorded as a failure, so the
# healthcheck's freshness probe sees it without reading the report.
export CHILD_STATUS=1 CHILD_RESULT=attention
expect_exit 1 "$TEST_ROOT/child-fail.out" run_reconcile
grep -q 'FAIL check=reconcile exit=1' "$TEST_ROOT/child-fail.out"
[[ $(status_field status) == fail ]]
[[ $(status_field exit) == 1 ]]
unset CHILD_STATUS CHILD_RESULT

# An in-flight deploy is not a failure: this holds the lock while it writes to
# Postgres, so it yields rather than interleaving with a migration. The status
# file is deliberately left untouched — a skip is not a run.
: > "$LOG"
cp "$REPORTS_ROOT/reconcile-status" "$TEST_ROOT/status-before-skip"
export LOCK_BUSY=1
run_reconcile > "$TEST_ROOT/busy.out" 2>&1
grep -q 'SKIP check=reconcile reason=deploy-active' "$TEST_ROOT/busy.out"
! grep -q '^pnpm|' "$LOG"
cmp -s "$TEST_ROOT/status-before-skip" "$REPORTS_ROOT/reconcile-status"
unset LOCK_BUSY

# An unusable release pointer fails closed at exit 2 without running anything.
: > "$LOG"
OUTSIDE="$TEST_ROOT/outside/apps/questura/apps/server"
mkdir -p "$OUTSIDE"
printf 'QUESTURA_RELEASE_SHA=%s\n' "$RELEASE_SHA" > "$OUTSIDE/.env.release"
ln -sfn "$OUTSIDE" "$DEPLOY_ROOT/current-server"
expect_exit 2 "$TEST_ROOT/outside.out" run_reconcile
grep -q 'FAIL check=reconcile reason=invalid-current-server' "$TEST_ROOT/outside.out"
! grep -q '^pnpm|' "$LOG"
# Still recorded as a failure: a wrapper that cannot start is not a fresh run.
[[ $(status_field status) == fail ]]
[[ $(status_field exit) == 2 ]]

NOT_A_SHA="$RELEASES_ROOT/not-a-sha/apps/questura/apps/server"
mkdir -p "$NOT_A_SHA"
printf 'QUESTURA_RELEASE_SHA=%s\n' "$RELEASE_SHA" > "$NOT_A_SHA/.env.release"
ln -sfn "$NOT_A_SHA" "$DEPLOY_ROOT/current-server"
expect_exit 2 "$TEST_ROOT/not-a-sha.out" run_reconcile
grep -q 'FAIL check=reconcile reason=invalid-current-server' "$TEST_ROOT/not-a-sha.out"

rm -f "$DEPLOY_ROOT/current-server"
expect_exit 2 "$TEST_ROOT/no-link.out" run_reconcile
grep -q 'FAIL check=reconcile reason=missing-current-server' "$TEST_ROOT/no-link.out"
ln -sfn "$SERVER_RELEASE" "$DEPLOY_ROOT/current-server"

# Missing config fails closed rather than running against whatever key happens
# to be in the ambient environment.
mv "$CONFIG_ROOT/server.env" "$CONFIG_ROOT/server.env.hidden"
expect_exit 2 "$TEST_ROOT/no-env.out" run_reconcile
grep -q 'FAIL check=reconcile reason=missing-server-env' "$TEST_ROOT/no-env.out"
mv "$CONFIG_ROOT/server.env.hidden" "$CONFIG_ROOT/server.env"

# An already-set key wins, so an operator can run one deliberate override
# without editing canonical config.
: > "$LOG"
(export STRIPE_SECRET_KEY=rk_live_operator_override; run_reconcile > /dev/null 2>&1)
grep -Fq 'key=present' "$LOG"

# Retention prunes dated reports and leaves the latest symlink and status alone.
: > "$REPORTS_ROOT/reconcile-1999-12-31.log"
touch -t 200001010000 "$REPORTS_ROOT/reconcile-1999-12-31.log"
run_reconcile > /dev/null 2>&1
[[ ! -e $REPORTS_ROOT/reconcile-1999-12-31.log ]]
[[ -f $REPORTS_ROOT/reconcile-$TODAY.log ]]
[[ -L $REPORTS_ROOT/reconcile-latest.log ]]
[[ -f $REPORTS_ROOT/reconcile-status ]]

# The apply and cap knobs are passed through to the orchestrator verbatim, so a
# dry run on the host really is a dry run.
: > "$LOG"
(
  export QUESTURA_RECONCILE_APPLY=0 QUESTURA_RECONCILE_MAX_APPLY=5
  run_reconcile > /dev/null 2>&1
)
grep -Fq 'apply=0|max_apply=5' "$LOG"

echo 'reconcile wrapper tests passed'
