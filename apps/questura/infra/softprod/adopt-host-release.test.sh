#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SUITE_ROOT=$(mktemp -d)
cleanup_suite() {
  if [[ ${KEEP_ADOPT_TEST_ROOT:-0} == 1 ]]; then
    echo "kept adoption test root: $SUITE_ROOT" >&2
  else
    rm -rf -- "$SUITE_ROOT"
  fi
}
trap cleanup_suite EXIT
REAL_INSTALL=$(command -v install)

file_mode() {
  python3 - "$1" <<'PY'
import pathlib
import stat
import sys
print(f"{stat.S_IMODE(pathlib.Path(sys.argv[1]).stat().st_mode):04o}")
PY
}

new_fixture() {
  local name=$1
  CASE_ROOT="$SUITE_ROOT/$name"
  REPO="$CASE_ROOT/repo"
  DEPLOY_ROOT="$CASE_ROOT/host"
  CONFIG_ROOT="$DEPLOY_ROOT/config"
  INFRA_ROOT="$DEPLOY_ROOT/infra"
  RENDERED_ROOT="$INFRA_ROOT/systemd"
  USER_UNIT_ROOT="$CASE_ROOT/user-units"
  FAKE_BIN="$CASE_ROOT/bin"
  STATE="$CASE_ROOT/state"
  EXPECTED="$CASE_ROOT/expected"
  LOG="$CASE_ROOT/commands.log"
  mkdir -p \
    "$REPO/apps/questura/infra/softprod" \
    "$REPO/apps/questura/apps/server" \
    "$REPO/apps/questura/apps/client" \
    "$CONFIG_ROOT" \
    "$RENDERED_ROOT" \
    "$USER_UNIT_ROOT" \
    "$FAKE_BIN" \
    "$STATE" \
    "$EXPECTED/units"

  cp \
    "$SCRIPT_DIR/adopt-host-release.sh" \
    "$SCRIPT_DIR/host-deploy-wrapper.sh" \
    "$SCRIPT_DIR/release-builder.sh" \
    "$SCRIPT_DIR/release-lib.sh" \
    "$REPO/apps/questura/infra/softprod/"
  chmod +x "$REPO/apps/questura/infra/softprod/adopt-host-release.sh" \
    "$REPO/apps/questura/infra/softprod/host-deploy-wrapper.sh"
  printf '%s\n' '{"name":"@questura/server"}' > "$REPO/apps/questura/apps/server/package.json"
  printf '%s\n' '{"name":"@questura/client"}' > "$REPO/apps/questura/apps/client/package.json"
  printf '%s\n' 'DATABASE_URI=postgres://fixture' > "$CONFIG_ROOT/server.env"
  printf '%s\n' 'NEXT_PUBLIC_SERVER_URL=https://cms.questurian.com' > "$CONFIG_ROOT/client.env"
  printf '%s\n' 'tunnel: fixture' > "$INFRA_ROOT/tunnel-config.yml"

  printf '%s\n' '[Service]' 'ExecStart=legacy-server' > "$USER_UNIT_ROOT/questura-server.service"
  printf '%s\n' '[Service]' 'ExecStart=legacy-client' > "$USER_UNIT_ROOT/questura-client.service"
  printf '%s\n' '[Service]' 'ExecStart=legacy-tunnel' > "$USER_UNIT_ROOT/questura-tunnel.service"
  chmod 0600 "$USER_UNIT_ROOT/questura-server.service"
  chmod 0640 "$USER_UNIT_ROOT/questura-client.service"
  chmod 0644 "$USER_UNIT_ROOT/questura-tunnel.service"
  printf '%s\n' '#!/usr/bin/env bash' 'echo legacy-wrapper' > "$DEPLOY_ROOT/deploy.sh"
  chmod 0740 "$DEPLOY_ROOT/deploy.sh"

  cp -p "$USER_UNIT_ROOT"/*.service "$EXPECTED/units/"
  cp -p "$DEPLOY_ROOT/deploy.sh" "$EXPECTED/deploy.sh"

  printf '%s\n' '[Service]' 'WorkingDirectory=%h/questura/current-server' 'ExecStart=new-server' > "$RENDERED_ROOT/questura-server.service"
  printf '%s\n' '[Service]' 'WorkingDirectory=%h/questura/current-client' 'ExecStart=new-client' > "$RENDERED_ROOT/questura-client.service"
  printf '%s\n' '[Service]' 'ExecStart=new-tunnel' '# journald' > "$RENDERED_ROOT/questura-tunnel.service"
  chmod 0644 "$RENDERED_ROOT"/*.service

  git -C "$REPO" init --quiet
  git -C "$REPO" config user.email adoption-test@example.invalid
  git -C "$REPO" config user.name adoption-test
  git -C "$REPO" add .
  git -C "$REPO" commit --quiet -m fixture
  SHA=$(git -C "$REPO" rev-parse HEAD)
  RELEASE="$DEPLOY_ROOT/releases/$SHA"
  mkdir -p \
    "$RELEASE/apps/questura/apps/server" \
    "$RELEASE/apps/questura/apps/client" \
    "$RELEASE/node_modules/.pnpm/fixture"
  printf '%s\n' server-artifact > "$RELEASE/apps/questura/apps/server/server.js"
  printf '%s\n' client-artifact > "$RELEASE/apps/questura/apps/client/client.js"
  printf '%s\n' dependency > "$RELEASE/node_modules/.pnpm/fixture/index.js"
  (
    export QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT"
    export QUESTURA_RELEASES_ROOT="$DEPLOY_ROOT/releases"
    SOURCE_REPO="$REPO"
    CONFIG_ROOT="$CONFIG_ROOT"
    # shellcheck source=release-lib.sh
    . "$REPO/apps/questura/infra/softprod/release-lib.sh"
    # shellcheck source=release-builder.sh
    . "$REPO/apps/questura/infra/softprod/release-builder.sh"
    write_release_metadata "$RELEASE" "$SHA"
    ensure_config_link "$RELEASE" server
    ensure_config_link "$RELEASE" client
    server_config=$(config_fingerprint server)
    client_config=$(config_fingerprint client)
    write_release_inputs "$RELEASE" "$SHA" "$server_config" "$client_config"
    write_marker "$RELEASE" server-ready server "$SHA" "$server_config"
    write_marker "$RELEASE" release-ready client "$SHA" "$client_config"
  )

  printf '%s\n' legacy-server > "$STATE/server-release"
  printf '%s\n' legacy-client > "$STATE/client-release"
  : > "$LOG"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'line=$1' \
    'for rule in trigger rollback; do' \
    '  if [[ $rule == trigger ]]; then' \
    '    match=${TRIGGER_MATCH:-}; occurrence=${TRIGGER_OCCURRENCE:-1}; status=${TRIGGER_STATUS:-41}; counter=$ADOPT_TEST_STATE/trigger.count' \
    '  else' \
    '    match=${ROLLBACK_FAIL_MATCH:-}; occurrence=${ROLLBACK_FAIL_OCCURRENCE:-1}; status=${ROLLBACK_FAIL_STATUS:-42}; counter=$ADOPT_TEST_STATE/rollback.count' \
    '  fi' \
    '  if [[ -n $match && $line == *"$match"* ]]; then' \
    '    count=0; [[ -f $counter ]] && read -r count < "$counter"' \
    '    count=$((count + 1)); printf "%s\\n" "$count" > "$counter"' \
    '    if ((count == occurrence)); then exit "$status"; fi' \
    '  fi' \
    'done' \
    'exit 0' > "$FAKE_BIN/adopt-test-maybe-fail"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'if [[ ${FAIL_FLOCK:-0} == 1 ]]; then exit 73; fi' > "$FAKE_BIN/flock"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'line="systemd-analyze|$*"' \
    'printf "%s\\n" "$line" >> "$ADOPT_TEST_LOG"' \
    '"$(dirname "$0")/adopt-test-maybe-fail" "$line"' > "$FAKE_BIN/systemd-analyze"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'line="systemctl|$*"' \
    'printf "%s\\n" "$line" >> "$ADOPT_TEST_LOG"' \
    '"$(dirname "$0")/adopt-test-maybe-fail" "$line" || exit $?' \
    'if [[ -n ${SIGNAL_MATCH:-} && $line == *"$SIGNAL_MATCH"* && ! -e $ADOPT_TEST_STATE/signal-fired ]]; then' \
    '  : > "$ADOPT_TEST_STATE/signal-fired"' \
    '  kill -"${SIGNAL_NAME:-TERM}" "$PPID"' \
    '  sleep 1' \
    'fi' \
    'case "$*" in' \
    '  *"is-active"*) [[ ${INACTIVE_UNIT:-} != "${!#}" ]] ;;' \
    '  *"is-enabled"*) [[ ${DISABLED_UNIT:-} != "${!#}" ]] ;;' \
    '  *"restart questura-server")' \
    '    if grep -q new-server "$ADOPT_TEST_USER_UNITS/questura-server.service"; then printf "%s\\n" "$ADOPT_TEST_TARGET_SHA" > "$ADOPT_TEST_STATE/server-release"; else printf "%s\\n" legacy-server > "$ADOPT_TEST_STATE/server-release"; fi ;;' \
    '  *"restart questura-client")' \
    '    if grep -q new-client "$ADOPT_TEST_USER_UNITS/questura-client.service"; then printf "%s\\n" "$ADOPT_TEST_TARGET_SHA" > "$ADOPT_TEST_STATE/client-release"; else printf "%s\\n" legacy-client > "$ADOPT_TEST_STATE/client-release"; fi ;;' \
    'esac' > "$FAKE_BIN/systemctl"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'url=${!#}' \
    'line="curl|$url"' \
    'printf "%s\\n" "$line" >> "$ADOPT_TEST_LOG"' \
    '"$(dirname "$0")/adopt-test-maybe-fail" "$line" || exit $?' \
    'case "$url" in *4000*|*cms.questurian.com*) component=server ;; *) component=client ;; esac' \
    'read -r release < "$ADOPT_TEST_STATE/$component-release"' \
    'if [[ -n ${HEALTH_MISMATCH_MATCH:-} && $url == *"$HEALTH_MISMATCH_MATCH"* && $release == "$ADOPT_TEST_TARGET_SHA" && ! -e $ADOPT_TEST_STATE/health-mismatch-fired ]]; then' \
    '  : > "$ADOPT_TEST_STATE/health-mismatch-fired"; release=wrong-release' \
    'fi' \
    'printf "%s\n" "{\"status\":\"healthy\",\"releaseSha\":\"$release\"}"' > "$FAKE_BIN/curl"

  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$FAKE_BIN/sleep"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'line="install|$*"' \
    'printf "%s\\n" "$line" >> "$ADOPT_TEST_LOG"' \
    '"$(dirname "$0")/adopt-test-maybe-fail" "$line" || exit $?' \
    'exec "$ADOPT_TEST_REAL_INSTALL" "$@"' > "$FAKE_BIN/install"
  chmod +x "$FAKE_BIN"/*
}

run_adopt() {
  env \
    PATH="$FAKE_BIN:$PATH" \
    QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT" \
    QUESTURA_RELEASES_ROOT="$DEPLOY_ROOT/releases" \
    QUESTURA_CONFIG_ROOT="$CONFIG_ROOT" \
    QUESTURA_INFRA_ROOT="$INFRA_ROOT" \
    QUESTURA_RENDERED_UNITS_ROOT="$RENDERED_ROOT" \
    QUESTURA_USER_UNIT_ROOT="$USER_UNIT_ROOT" \
    QUESTURA_DEPLOY_WRAPPER_TARGET="$DEPLOY_ROOT/deploy.sh" \
    QUESTURA_HEALTH_ATTEMPTS=1 \
    QUESTURA_HEALTH_SLEEP_SECONDS=0 \
    ADOPT_TEST_LOG="$LOG" \
    ADOPT_TEST_STATE="$STATE" \
    ADOPT_TEST_TARGET_SHA="$SHA" \
    ADOPT_TEST_USER_UNITS="$USER_UNIT_ROOT" \
    ADOPT_TEST_REAL_INSTALL="$REAL_INSTALL" \
    FAIL_FLOCK="${FAIL_FLOCK:-0}" \
    INACTIVE_UNIT="${INACTIVE_UNIT:-}" \
    DISABLED_UNIT="${DISABLED_UNIT:-}" \
    TRIGGER_MATCH="${TRIGGER_MATCH:-}" \
    TRIGGER_OCCURRENCE="${TRIGGER_OCCURRENCE:-1}" \
    TRIGGER_STATUS="${TRIGGER_STATUS:-41}" \
    ROLLBACK_FAIL_MATCH="${ROLLBACK_FAIL_MATCH:-}" \
    ROLLBACK_FAIL_OCCURRENCE="${ROLLBACK_FAIL_OCCURRENCE:-1}" \
    ROLLBACK_FAIL_STATUS="${ROLLBACK_FAIL_STATUS:-42}" \
    HEALTH_MISMATCH_MATCH="${HEALTH_MISMATCH_MATCH:-}" \
    SIGNAL_MATCH="${SIGNAL_MATCH:-}" \
    SIGNAL_NAME="${SIGNAL_NAME:-TERM}" \
    "$REPO/apps/questura/infra/softprod/adopt-host-release.sh"
}

assert_status() {
  local expected=$1
  local actual=$2
  if [[ $actual != "$expected" ]]; then
    echo "expected exit $expected, got $actual for $CASE_ROOT" >&2
    exit 1
  fi
}

assert_no_mutation() {
  [[ ! -e $DEPLOY_ROOT/current-server && ! -L $DEPLOY_ROOT/current-server ]]
  [[ ! -e $DEPLOY_ROOT/current-client && ! -L $DEPLOY_ROOT/current-client ]]
  cmp -s "$EXPECTED/deploy.sh" "$DEPLOY_ROOT/deploy.sh"
  for unit in questura-server questura-client questura-tunnel; do
    cmp -s "$EXPECTED/units/$unit.service" "$USER_UNIT_ROOT/$unit.service"
  done
}

assert_restored() {
  assert_no_mutation
  [[ $(file_mode "$EXPECTED/deploy.sh") == "$(file_mode "$DEPLOY_ROOT/deploy.sh")" ]]
  for unit in questura-server questura-client questura-tunnel; do
    [[ $(file_mode "$EXPECTED/units/$unit.service") == "$(file_mode "$USER_UNIT_ROOT/$unit.service")" ]]
  done
  grep -qF 'systemctl|--user restart questura-tunnel' "$LOG"
  grep -qF 'curl|https://www.questurian.com/api/health' "$LOG"
}

# Happy path: exact files/modes, paired links, deterministic activation order.
new_fixture happy
run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err"
grep -q "Adopted initial immutable release $SHA" "$CASE_ROOT/out"
[[ $(readlink "$DEPLOY_ROOT/current-server") == "$RELEASE/apps/questura/apps/server" ]]
[[ $(readlink "$DEPLOY_ROOT/current-client") == "$RELEASE/apps/questura/apps/client" ]]
[[ ! -e $DEPLOY_ROOT/previous-server && ! -L $DEPLOY_ROOT/previous-server ]]
[[ ! -e $DEPLOY_ROOT/previous-client && ! -L $DEPLOY_ROOT/previous-client ]]
for unit in questura-server questura-client questura-tunnel; do
  cmp -s "$RENDERED_ROOT/$unit.service" "$USER_UNIT_ROOT/$unit.service"
  [[ $(file_mode "$USER_UNIT_ROOT/$unit.service") == 0644 ]]
done
cmp -s "$REPO/apps/questura/infra/softprod/host-deploy-wrapper.sh" "$DEPLOY_ROOT/deploy.sh"
[[ $(file_mode "$DEPLOY_ROOT/deploy.sh") == 0755 ]]
BACKUP=$(find "$DEPLOY_ROOT/backups/host-adoption" -mindepth 1 -maxdepth 1 -type d -print -quit)
[[ $(file_mode "$BACKUP") == 0700 && $(file_mode "$BACKUP/manifest") == 0600 ]]
cmp -s "$EXPECTED/deploy.sh" "$BACKUP/wrapper/deploy.sh"
for unit in questura-server questura-client questura-tunnel; do
  cmp -s "$EXPECTED/units/$unit.service" "$BACKUP/units/$unit.service"
done
python3 - "$LOG" <<'PY'
import pathlib
import sys
text = pathlib.Path(sys.argv[1]).read_text()
text = text[text.index("systemctl|--user daemon-reload"):]
ordered = [
    "systemctl|--user restart questura-server",
    "curl|http://127.0.0.1:4000/api/health",
    "curl|https://cms.questurian.com/api/health",
    "systemctl|--user restart questura-client",
    "curl|http://127.0.0.1:3000/api/health",
    "curl|https://www.questurian.com/api/health",
    "systemctl|--user restart questura-tunnel",
    "curl|http://127.0.0.1:4000/api/health",
    "curl|https://cms.questurian.com/api/health",
    "curl|http://127.0.0.1:3000/api/health",
    "curl|https://www.questurian.com/api/health",
]
position = -1
for token in ordered:
    position = text.index(token, position + 1)
PY

# Preflight failures occur before backup or mutation.
new_fixture lock
code=0
FAIL_FLOCK=1 run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 1 "$code"
grep -q 'another Questura deploy or host operation is running' "$CASE_ROOT/err"
assert_no_mutation

for link_name in current-server previous-client; do
  new_fixture "dangling-${link_name}"
  ln -s "$DEPLOY_ROOT/releases/missing" "$DEPLOY_ROOT/$link_name"
  code=0
  run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
  assert_status 1 "$code"
  grep -q 'initial release link already exists' "$CASE_ROOT/err"
  [[ -L $DEPLOY_ROOT/$link_name ]]
done

new_fixture incomplete
rm "$RELEASE/.questura/release-ready"
code=0
run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 1 "$code"
grep -q 'release is not complete' "$CASE_ROOT/err"
assert_no_mutation

new_fixture dirty
printf '%s\n' dirty > "$REPO/untracked"
code=0
run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 1 "$code"
grep -q 'deployment checkout is not clean' "$CASE_ROOT/err"
assert_no_mutation

new_fixture inactive
code=0
INACTIVE_UNIT=questura-tunnel run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 1 "$code"
grep -q 'required user service is not active: questura-tunnel' "$CASE_ROOT/err"
assert_no_mutation

new_fixture invalid-unit
code=0
TRIGGER_MATCH='systemd-analyze|' TRIGGER_STATUS=45 run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 45 "$code"
assert_no_mutation

# Failures after links, unit replacement, activation, health, and tunnel restore all state.
new_fixture unit-install-failure
code=0
TRIGGER_MATCH='questura-client.service.adopt' TRIGGER_STATUS=46 run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 46 "$code"
assert_restored

new_fixture reload-failure
code=0
TRIGGER_MATCH='systemctl|--user daemon-reload' TRIGGER_STATUS=47 run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 47 "$code"
assert_restored

new_fixture server-restart-failure
code=0
TRIGGER_MATCH='restart questura-server' TRIGGER_STATUS=48 run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 48 "$code"
assert_restored

new_fixture public-health-mismatch
code=0
HEALTH_MISMATCH_MATCH='cms.questurian.com' run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 1 "$code"
grep -q 'public server did not report release' "$CASE_ROOT/err"
assert_restored

new_fixture tunnel-restart-failure
code=0
TRIGGER_MATCH='restart questura-tunnel' TRIGGER_STATUS=49 run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 49 "$code"
assert_restored

# TERM after mutation uses same rollback path and preserves signal status.
new_fixture signal
code=0
SIGNAL_MATCH='restart questura-server' SIGNAL_NAME=TERM run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 143 "$code"
assert_restored

# Rollback failure is loud, retains original status, and does not skip later cleanup.
new_fixture rollback-failure
code=0
TRIGGER_MATCH='restart questura-server' \
  TRIGGER_STATUS=50 \
  ROLLBACK_FAIL_MATCH='systemctl|--user daemon-reload' \
  ROLLBACK_FAIL_OCCURRENCE=2 \
  ROLLBACK_FAIL_STATUS=51 \
  run_adopt > "$CASE_ROOT/out" 2> "$CASE_ROOT/err" || code=$?
assert_status 50 "$code"
grep -q 'CRITICAL: initial release adoption rollback is incomplete' "$CASE_ROOT/err"
assert_restored

# Adoption must consume prepared artifacts only.
if rg -n '(pnpm (install|build)|db:migrate|docker compose|prepare_server_release|complete_client_release)' "$SCRIPT_DIR/adopt-host-release.sh"; then
  echo 'initial adoption contains a forbidden build, install, migration, or compose operation' >&2
  exit 1
fi

echo 'initial release adoption tests passed'
