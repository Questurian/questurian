#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

DEPLOY_ROOT="$TEST_ROOT/host"
RELEASES_ROOT="$DEPLOY_ROOT/releases"
INFRA_ROOT="$DEPLOY_ROOT/infra"
FAKE_BIN="$TEST_ROOT/bin"
LOG="$TEST_ROOT/commands.log"
REPORTS_ROOT="$DEPLOY_ROOT/reports"
FLOCK_COUNT="$TEST_ROOT/flock-count"
TRANSITION_MARKER="$TEST_ROOT/transitioned"
SECRET_SENTINEL='postgres://monitor-secret:never-print@example.invalid/db'
mkdir -p "$RELEASES_ROOT" "$INFRA_ROOT" "$FAKE_BIN"
printf '%s\n' 'services: {}' > "$INFRA_ROOT/compose.yml"
printf '%s\n' 'POSTGRES_PASSWORD=monitor-secret-never-print' > "$INFRA_ROOT/.env"
: > "$DEPLOY_ROOT/deploy.lock"

make_release() {
  local sha=$1
  local component=$2
  local directory="$RELEASES_ROOT/$sha/apps/questura/apps/$component"
  mkdir -p "$directory"
  printf 'QUESTURA_RELEASE_SHA=%s\n' "$sha" > "$directory/.env.release"
  printf '%s\n' "$directory"
}

OLD_SHA=1111111111111111111111111111111111111111
NEW_SHA=2222222222222222222222222222222222222222
OLD_SERVER=$(make_release "$OLD_SHA" server)
OLD_CLIENT=$(make_release "$OLD_SHA" client)
NEW_SERVER=$(make_release "$NEW_SHA" server)
NEW_CLIENT=$(make_release "$NEW_SHA" client)
ln -s "$OLD_SERVER" "$DEPLOY_ROOT/current-server"
ln -s "$OLD_CLIENT" "$DEPLOY_ROOT/current-client"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -u' \
  'printf "systemctl|%s\\n" "$*" >> "$MONITOR_TEST_LOG"' \
  'unit=${*: -1}' \
  'if [[ ${FAIL_UNIT:-} == "$unit" ]]; then printf "%s\\n" failed; exit 3; fi' \
  'printf "%s\\n" active' > "$FAKE_BIN/systemctl"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -u' \
  'printf "docker|%s\\n" "$*" >> "$MONITOR_TEST_LOG"' \
  'if [[ ${1:-} == compose ]]; then' \
  '  [[ ${FAIL_COMPOSE:-0} != 1 ]]' \
  '  exit' \
  'fi' \
  'container=${*: -1}' \
  'case "$container" in' \
  '  questura-postgres) printf "%s|%s|%s|%s\\n" "${POSTGRES_STATUS:-running}" "${POSTGRES_HEALTH:-healthy}" "${POSTGRES_PROJECT:-infra}" "${POSTGRES_SERVICE:-postgres}" ;;' \
  '  questura-redis) printf "%s|%s|%s|%s\\n" "${REDIS_STATUS:-running}" "${REDIS_HEALTH:-healthy}" "${REDIS_PROJECT:-infra}" "${REDIS_SERVICE:-redis}" ;;' \
  '  *) exit 1 ;;' \
  'esac' > "$FAKE_BIN/docker"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -u' \
  'printf "curl|%s\\n" "$*" >> "$MONITOR_TEST_LOG"' \
  'output=""; previous=""; url=""' \
  'for argument in "$@"; do' \
  '  if [[ $previous == --output ]]; then output=$argument; fi' \
  '  previous=$argument; url=$argument' \
  'done' \
  'case "$url" in' \
  '  *127.0.0.1:4000*) label=local-server; metadata="$QUESTURA_DEPLOY_ROOT/current-server/.env.release" ;;' \
  '  *cms.questurian.com*) label=public-server; metadata="$QUESTURA_DEPLOY_ROOT/current-server/.env.release" ;;' \
  '  *127.0.0.1:3000*) label=local-client; metadata="$QUESTURA_DEPLOY_ROOT/current-client/.env.release" ;;' \
  '  *www.questurian.com*) label=public-client; metadata="$QUESTURA_DEPLOY_ROOT/current-client/.env.release" ;;' \
  '  *) exit 2 ;;' \
  'esac' \
  '. "$metadata"' \
  'mode=healthy' \
  'if [[ ${FAIL_ENDPOINT:-} == "$label" ]]; then mode=${ENDPOINT_MODE:-wrong-sha}; fi' \
  'case "$mode" in' \
  '  healthy) printf '\''{"status":"healthy","releaseSha":"%s"}'\'' "$QUESTURA_RELEASE_SHA" > "$output"; code=200 ;;' \
  '  wrong-sha) printf '\''{"status":"healthy","releaseSha":"3333333333333333333333333333333333333333"}'\'' > "$output"; code=200 ;;' \
  '  unhealthy) printf '\''{"status":"unhealthy","releaseSha":"%s","error":"%s"}'\'' "$QUESTURA_RELEASE_SHA" "$MONITOR_TEST_SECRET" > "$output"; code=503 ;;' \
  '  invalid-json) printf '\''%s'\'' "$MONITOR_TEST_SECRET" > "$output"; code=200 ;;' \
  '  http) printf '\''{"status":"healthy","releaseSha":"%s"}'\'' "$QUESTURA_RELEASE_SHA" > "$output"; code=502 ;;' \
  '  curl) exit 7 ;;' \
  'esac' \
  'if [[ ${TRANSITION_ON_CURL:-0} == 1 && ! -e $TRANSITION_MARKER ]]; then' \
  '  touch "$TRANSITION_MARKER"' \
  '  ln -sfn "$NEW_SERVER" "$QUESTURA_DEPLOY_ROOT/current-server"' \
  '  ln -sfn "$NEW_CLIENT" "$QUESTURA_DEPLOY_ROOT/current-client"' \
  'fi' \
  'printf "%s" "$code"' > "$FAKE_BIN/curl"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -u' \
  'printf "flock|%s\\n" "$*" >> "$MONITOR_TEST_LOG"' \
  'count=0; if [[ -f $FLOCK_COUNT ]]; then count=$(cat "$FLOCK_COUNT"); fi; count=$((count + 1)); printf "%s\\n" "$count" > "$FLOCK_COUNT"' \
  'case ${BUSY_PHASE:-} in start) ((count == 1)) && exit 1 ;; end) ((count == 2)) && exit 1 ;; always) exit 1 ;; esac' \
  'exit 0' > "$FAKE_BIN/flock"
chmod +x "$FAKE_BIN"/*

run_monitor() {
  rm -f "$FLOCK_COUNT" "$TRANSITION_MARKER"
  env \
    PATH="$FAKE_BIN:$PATH" \
    QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT" \
    QUESTURA_RELEASES_ROOT="$RELEASES_ROOT" \
    QUESTURA_INFRA_ROOT="$INFRA_ROOT" \
    QUESTURA_REPORTS_ROOT="$REPORTS_ROOT" \
    QUESTURA_MONITOR_CURL_MAX_TIME=1 \
    MONITOR_TEST_LOG="$LOG" \
    MONITOR_TEST_SECRET="$SECRET_SENTINEL" \
    FAIL_UNIT="${FAIL_UNIT:-}" \
    FAIL_COMPOSE="${FAIL_COMPOSE:-0}" \
    FAIL_ENDPOINT="${FAIL_ENDPOINT:-}" \
    ENDPOINT_MODE="${ENDPOINT_MODE:-}" \
    POSTGRES_STATUS="${POSTGRES_STATUS:-running}" \
    POSTGRES_HEALTH="${POSTGRES_HEALTH:-healthy}" \
    POSTGRES_PROJECT="${POSTGRES_PROJECT:-infra}" \
    POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}" \
    REDIS_STATUS="${REDIS_STATUS:-running}" \
    REDIS_HEALTH="${REDIS_HEALTH:-healthy}" \
    REDIS_PROJECT="${REDIS_PROJECT:-infra}" \
    REDIS_SERVICE="${REDIS_SERVICE:-redis}" \
    BUSY_PHASE="${BUSY_PHASE:-}" \
    FLOCK_COUNT="$FLOCK_COUNT" \
    TRANSITION_ON_CURL="${TRANSITION_ON_CURL:-0}" \
    TRANSITION_MARKER="$TRANSITION_MARKER" \
    NEW_SERVER="$NEW_SERVER" \
    NEW_CLIENT="$NEW_CLIENT" \
    "$SCRIPT_DIR/healthcheck.sh"
}

reset_pair() {
  ln -sfn "$OLD_SERVER" "$DEPLOY_ROOT/current-server"
  ln -sfn "$OLD_CLIENT" "$DEPLOY_ROOT/current-client"
}

expect_failure() {
  local output=$1
  shift
  set +e
  "$@" > "$output" 2>&1
  local code=$?
  set -e
  [[ $code == 1 ]]
}

# Healthy run covers exact release identity, every endpoint, units, Compose,
# and both stable data containers without mutating host state.
: > "$LOG"
if ! run_monitor > "$TEST_ROOT/healthy.out" 2>&1; then
  echo 'healthy monitor fixture failed:' >&2
  tail -40 "$TEST_ROOT/healthy.out" >&2
  exit 1
fi
grep -q "OK check=summary release_sha=$OLD_SHA" "$TEST_ROOT/healthy.out"
[[ $(grep -c '^curl|' "$LOG") == 4 ]]
[[ $(grep -c '^systemctl|' "$LOG") == 3 ]]
[[ $(grep -c '^docker|inspect ' "$LOG") == 2 ]]
grep -q '^docker|compose .* config --quiet$' "$LOG"
for url in \
  'http://127.0.0.1:4000/api/health' \
  'https://cms.questurian.com/api/health' \
  'http://127.0.0.1:3000/api/health' \
  'https://www.questurian.com/api/health'; do
  grep -Fq "$url" "$LOG"
done
! grep -Eq 'systemctl\|.*restart|docker\|.*(up|restart|exec)|db:migrate' "$LOG"
[[ $(readlink "$DEPLOY_ROOT/current-server") == "$OLD_SERVER" ]]
[[ $(readlink "$DEPLOY_ROOT/current-client") == "$OLD_CLIENT" ]]

# Each endpoint must report exact SHA; parser and HTTP failures stay sanitized.
for endpoint in local-server public-server local-client public-client; do
  export FAIL_ENDPOINT=$endpoint ENDPOINT_MODE=wrong-sha
  expect_failure "$TEST_ROOT/$endpoint.out" run_monitor
  grep -q "FAIL check=endpoint label=$endpoint" "$TEST_ROOT/$endpoint.out"
done
for mode in unhealthy invalid-json http curl; do
  export FAIL_ENDPOINT=public-server ENDPOINT_MODE=$mode
  expect_failure "$TEST_ROOT/endpoint-$mode.out" run_monitor
  grep -q 'FAIL check=endpoint label=public-server' "$TEST_ROOT/endpoint-$mode.out"
  ! grep -Fq "$SECRET_SENTINEL" "$TEST_ROOT/endpoint-$mode.out"
done
unset FAIL_ENDPOINT ENDPOINT_MODE

# Invalid release pointers fail closed before endpoint checks.
ln -sfn "$NEW_CLIENT" "$DEPLOY_ROOT/current-client"
: > "$LOG"
expect_failure "$TEST_ROOT/mismatched.out" run_monitor
grep -q 'FAIL check=release-pair phase=start reason=invalid-or-mismatched' "$TEST_ROOT/mismatched.out"
[[ $(grep -c '^curl|' "$LOG" || true) == 0 ]]
reset_pair

mv "$OLD_SERVER/.env.release" "$OLD_SERVER/.env.release.missing"
expect_failure "$TEST_ROOT/missing-metadata.out" run_monitor
grep -q 'FAIL check=release-pair phase=start reason=invalid-or-mismatched' "$TEST_ROOT/missing-metadata.out"
mv "$OLD_SERVER/.env.release.missing" "$OLD_SERVER/.env.release"

OUTSIDE="$TEST_ROOT/outside/apps/questura/apps/server"
mkdir -p "$OUTSIDE"
printf 'QUESTURA_RELEASE_SHA=%s\n' "$OLD_SHA" > "$OUTSIDE/.env.release"
ln -sfn "$OUTSIDE" "$DEPLOY_ROOT/current-server"
expect_failure "$TEST_ROOT/outside.out" run_monitor
grep -q 'FAIL check=release-pair phase=start reason=invalid-or-mismatched' "$TEST_ROOT/outside.out"
reset_pair

# Unit, Compose, and container failures aggregate instead of short-circuiting.
export FAIL_UNIT=questura-client FAIL_COMPOSE=1 FAIL_ENDPOINT=local-server ENDPOINT_MODE=wrong-sha POSTGRES_HEALTH=unhealthy REDIS_STATUS=stopped
expect_failure "$TEST_ROOT/aggregate.out" run_monitor
grep -q 'FAIL check=unit unit=questura-client' "$TEST_ROOT/aggregate.out"
grep -q 'FAIL check=compose reason=invalid-config' "$TEST_ROOT/aggregate.out"
grep -q 'FAIL check=container container=questura-postgres' "$TEST_ROOT/aggregate.out"
grep -q 'FAIL check=container container=questura-redis' "$TEST_ROOT/aggregate.out"
grep -q 'FAIL check=endpoint label=local-server' "$TEST_ROOT/aggregate.out"
grep -q 'FAIL check=summary failures=' "$TEST_ROOT/aggregate.out"
unset FAIL_UNIT FAIL_COMPOSE FAIL_ENDPOINT ENDPOINT_MODE POSTGRES_HEALTH REDIS_STATUS

for unit in questura-server questura-client questura-tunnel; do
  export FAIL_UNIT=$unit
  expect_failure "$TEST_ROOT/unit-$unit.out" run_monitor
  grep -q "FAIL check=unit unit=$unit" "$TEST_ROOT/unit-$unit.out"
done
unset FAIL_UNIT

export POSTGRES_PROJECT=other
expect_failure "$TEST_ROOT/postgres-label.out" run_monitor
grep -q 'FAIL check=container container=questura-postgres' "$TEST_ROOT/postgres-label.out"
unset POSTGRES_PROJECT

# Deploy activity or a valid paired release transition discards transient
# failures and exits successfully without ever holding the deploy lock.
export BUSY_PHASE=start FAIL_ENDPOINT=local-server ENDPOINT_MODE=wrong-sha
run_monitor > "$TEST_ROOT/busy-start.out" 2>&1
grep -q 'SKIP check=monitor reason=deploy-active phase=start' "$TEST_ROOT/busy-start.out"
! grep -q '^FAIL ' "$TEST_ROOT/busy-start.out"
unset BUSY_PHASE

export BUSY_PHASE=end
run_monitor > "$TEST_ROOT/busy-end.out" 2>&1
grep -q 'SKIP check=monitor reason=deploy-active phase=end' "$TEST_ROOT/busy-end.out"
! grep -q '^FAIL ' "$TEST_ROOT/busy-end.out"
unset BUSY_PHASE FAIL_ENDPOINT ENDPOINT_MODE

export TRANSITION_ON_CURL=1 FAIL_ENDPOINT=public-client ENDPOINT_MODE=wrong-sha
run_monitor > "$TEST_ROOT/transition.out" 2>&1
grep -q "SKIP check=monitor reason=release-transition from_sha=$OLD_SHA to_sha=$NEW_SHA" "$TEST_ROOT/transition.out"
! grep -q '^FAIL ' "$TEST_ROOT/transition.out"
unset TRANSITION_ON_CURL FAIL_ENDPOINT ENDPOINT_MODE
reset_pair

export FAIL_ENDPOINT=local-server ENDPOINT_MODE=wrong-sha
expect_failure "$TEST_ROOT/unchanged-outage.out" run_monitor
grep -q 'FAIL check=endpoint label=local-server' "$TEST_ROOT/unchanged-outage.out"
unset FAIL_ENDPOINT ENDPOINT_MODE

# Nightly reconciliation freshness. Every case above already ran with the reports
# directory absent, which is the not-adopted path — assert it explicitly, because
# getting it wrong turns this monitor red on the deploy that ships the probe and
# before the timer is ever installed.
[[ ! -d $REPORTS_ROOT ]]
run_monitor > "$TEST_ROOT/reconcile-not-adopted.out" 2>&1
grep -q 'OK check=reconcile state=not-adopted' "$TEST_ROOT/reconcile-not-adopted.out"

write_reconcile_status() {
  mkdir -p "$REPORTS_ROOT"
  printf 'status=%s exit=%s finished_at=%s\n' "$1" "$2" "$(( $(date -u +%s) - $3 ))" \
    > "$REPORTS_ROOT/reconcile-status"
}

write_reconcile_status ok 0 3600
run_monitor > "$TEST_ROOT/reconcile-fresh.out" 2>&1
grep -q 'OK check=reconcile state=fresh age_seconds=' "$TEST_ROOT/reconcile-fresh.out"

# 36h + an hour: one missed nightly is tolerated, two are not.
write_reconcile_status ok 0 133200
expect_failure "$TEST_ROOT/reconcile-stale.out" run_monitor
grep -q 'FAIL check=reconcile reason=stale age_seconds=' "$TEST_ROOT/reconcile-stale.out"

# A fresh run that failed is still a failure; the age must not excuse it.
write_reconcile_status fail 1 60
expect_failure "$TEST_ROOT/reconcile-failed.out" run_monitor
grep -q 'FAIL check=reconcile reason=last-run-failed exit=1' "$TEST_ROOT/reconcile-failed.out"

# An adopted directory with no status file, and a corrupted one, both fail closed
# rather than reading as fresh or echoing their contents.
rm -f "$REPORTS_ROOT/reconcile-status"
expect_failure "$TEST_ROOT/reconcile-missing.out" run_monitor
grep -q 'FAIL check=reconcile reason=status-missing' "$TEST_ROOT/reconcile-missing.out"

printf 'status=%s finished_at=tomorrow\n' "$SECRET_SENTINEL" > "$REPORTS_ROOT/reconcile-status"
expect_failure "$TEST_ROOT/reconcile-corrupt.out" run_monitor
grep -q 'FAIL check=reconcile reason=status-unreadable' "$TEST_ROOT/reconcile-corrupt.out"
! grep -Fq "$SECRET_SENTINEL" "$TEST_ROOT/reconcile-corrupt.out"

rm -rf "$REPORTS_ROOT"

echo 'health monitor tests passed'
