#!/usr/bin/env bash
# Railway pre-deploy: order, fail-closed, direct endpoint, and that the
# committed railway.json really points at this script.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SERVER_DIR=$(cd -- "$SCRIPT_DIR/../.." && pwd)
RAILWAY_JSON="$SERVER_DIR/../../infra/railway/railway.json"
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

FAKE_SERVER="$TEST_ROOT/server"
FAKE_BIN="$TEST_ROOT/bin"
LOG="$TEST_ROOT/commands.log"
mkdir -p "$FAKE_SERVER/scripts/deploy" "$FAKE_BIN"
cp "$SCRIPT_DIR/pre-deploy.sh" "$FAKE_SERVER/scripts/deploy/"

# Fake node/pnpm record what they were asked to do and with which database.
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "%s %s | %s\n" "$(basename "$0")" "$*" "${DATABASE_URI:-unset}" >> "$PREDEPLOY_TEST_LOG"' \
  'if [[ $(basename "$0") == node && $* == *check-pending-migrations.mjs && ${FAIL_GUARD:-0} == 1 ]]; then exit 1; fi' \
  'if [[ $(basename "$0") == pnpm && $* == db:migrate && ${FAIL_MIGRATE:-0} == 1 ]]; then exit 42; fi' \
  'if [[ $(basename "$0") == node && $* == *--require-clean && ${FAIL_CLEAN:-0} == 1 ]]; then exit 1; fi' > "$FAKE_BIN/pnpm"
cp "$FAKE_BIN/pnpm" "$FAKE_BIN/node"
chmod +x "$FAKE_BIN"/*

run() {
  : > "$LOG"
  env -u DATABASE_URI -u DATABASE_URI_UNPOOLED PATH="$FAKE_BIN:$PATH" PREDEPLOY_TEST_LOG="$LOG" "$@" \
    bash "$FAKE_SERVER/scripts/deploy/pre-deploy.sh" > "$TEST_ROOT/out.log" 2>&1
}

fail() {
  echo "pre-deploy test failed: $1" >&2
  echo "--- commands" >&2; cat "$LOG" >&2
  echo "--- output" >&2; cat "$TEST_ROOT/out.log" >&2
  exit 1
}

# 1. Happy path: guard, migrate, clean check, search backfill, in that order,
#    all against the direct endpoint.
run DATABASE_URI=postgres://pooled DATABASE_URI_UNPOOLED=postgres://direct || fail "happy path exited non-zero"
expected=$'node scripts/deploy/check-pending-migrations.mjs | postgres://direct
pnpm db:migrate | postgres://direct
node scripts/deploy/check-pending-migrations.mjs --require-clean | postgres://direct
pnpm rebuild:search-index -- --if-empty | postgres://direct'
[[ $(cat "$LOG") == "$expected" ]] || fail "unexpected command sequence"

# 2. Only a pooled/plain DATABASE_URI: used as given.
run DATABASE_URI=postgres://plain || fail "plain DATABASE_URI exited non-zero"
grep -q '^pnpm db:migrate | postgres://plain$' "$LOG" || fail "plain DATABASE_URI not used"

# 3. A risky pending migration: nothing is migrated.
if run DATABASE_URI=postgres://direct FAIL_GUARD=1; then fail "guard failure did not fail the deploy"; fi
grep -q 'db:migrate' "$LOG" && fail "migrated after the guard refused"

# 4. A failed migration: the deploy fails and the index is not touched.
if run DATABASE_URI=postgres://direct FAIL_MIGRATE=1; then fail "migration failure did not fail the deploy"; fi
grep -q 'rebuild:search-index' "$LOG" && fail "continued after a failed migration"

# 5. Still pending after migrating: the deploy fails.
if run DATABASE_URI=postgres://direct FAIL_CLEAN=1; then fail "pending-after-migrate did not fail the deploy"; fi

# 6. No database configured: refuse before running anything.
if run; then fail "ran without DATABASE_URI"; fi
[[ -s $LOG ]] && fail "ran commands without DATABASE_URI"

# 7. The committed Railway config runs exactly this script, and there is no
#    override variable anywhere in it.
[[ -f $RAILWAY_JSON ]] || fail "infra/railway/railway.json is missing"
node -e '
  const config = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
  const command = config.deploy && config.deploy.preDeployCommand
  const text = Array.isArray(command) ? command.join(" ") : command
  if (Array.isArray(command) && command.length !== 1) throw new Error("Railway accepts one preDeployCommand")
  if (text !== "bash scripts/deploy/pre-deploy.sh") throw new Error(`preDeployCommand is ${JSON.stringify(text)}`)
  if (!config.deploy.startCommand) throw new Error("startCommand is missing")
  if (config.deploy.healthcheckPath !== "/api/health/ready") throw new Error("healthcheckPath is not /api/health/ready")
' "$RAILWAY_JSON" || fail "railway.json does not run the pre-deploy script"
[[ -f $SERVER_DIR/scripts/deploy/pre-deploy.sh ]] || fail "preDeployCommand path does not exist under the service root"

echo "railway pre-deploy tests passed"
