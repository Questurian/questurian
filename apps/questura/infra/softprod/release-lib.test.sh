#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

export QUESTURA_DEPLOY_ROOT="$TEST_ROOT/host"
export QUESTURA_RELEASES_ROOT="$QUESTURA_DEPLOY_ROOT/releases"
export QUESTURA_HEALTH_ATTEMPTS=1
export QUESTURA_HEALTH_SLEEP_SECONDS=0
export TEST_COMMAND_LOG="$TEST_ROOT/commands.log"
FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$QUESTURA_RELEASES_ROOT" "$FAKE_BIN"

make_release() {
  local sha=$1
  local component=$2
  local directory="$QUESTURA_RELEASES_ROOT/$sha/apps/questura/apps/$component"
  mkdir -p "$directory"
  printf 'QUESTURA_RELEASE_SHA=%s\n' "$sha" > "$directory/.env.release"
  printf '%s\n' "$directory"
}

OLD_SHA=1111111111111111111111111111111111111111
NEW_SHA=2222222222222222222222222222222222222222
OLD_SERVER=$(make_release "$OLD_SHA" server)
NEW_SERVER=$(make_release "$NEW_SHA" server)
OLD_CLIENT=$(make_release "$OLD_SHA" client)
NEW_CLIENT=$(make_release "$NEW_SHA" client)

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "%s|%s\\n" "$(basename "$0")" "$*" >> "$TEST_COMMAND_LOG"' \
  'if [[ -n ${SABOTAGE_CLIENT_LINK_MARKER:-} && $* == *questura-client* && ! -e $SABOTAGE_CLIENT_LINK_MARKER ]]; then touch "$SABOTAGE_CLIENT_LINK_MARKER"; unlink "$QUESTURA_DEPLOY_ROOT/current-client"; mkdir "$QUESTURA_DEPLOY_ROOT/current-client"; exit 75; fi' \
  'if [[ -n ${FAIL_RESTART_MARKER:-} && ! -e $FAIL_RESTART_MARKER ]]; then touch "$FAIL_RESTART_MARKER"; exit 74; fi' > "$FAKE_BIN/systemctl"
chmod +x "$FAKE_BIN/systemctl"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ -n ${FAKE_HEALTH_SHA:-} ]]; then sha=$FAKE_HEALTH_SHA' \
  'elif [[ $* == *cms.questurian.com* || $* == *127.0.0.1:4000* ]]; then . "$QUESTURA_DEPLOY_ROOT/current-server/.env.release"; sha=$QUESTURA_RELEASE_SHA' \
  'else . "$QUESTURA_DEPLOY_ROOT/current-client/.env.release"; sha=$QUESTURA_RELEASE_SHA; fi' \
  'if [[ ${FAIL_PUBLIC_SERVER_HEALTH:-0} == 1 && $* == *cms.questurian.com* ]]; then sha=ffffffffffffffffffffffffffffffffffffffff; fi' \
  'if [[ -n ${FAIL_SERVER_SHA:-} && ($* == *cms.questurian.com* || $* == *127.0.0.1:4000*) && $sha == "$FAIL_SERVER_SHA" ]]; then sha=ffffffffffffffffffffffffffffffffffffffff; fi' \
  'if [[ -n ${FAIL_CLIENT_SHA:-} && ($* == *www.questurian.com* || $* == *127.0.0.1:3000*) && $sha == "$FAIL_CLIENT_SHA" ]]; then sha=ffffffffffffffffffffffffffffffffffffffff; fi' \
  'printf '\''{"status":"healthy","releaseSha":"%s"}'\'' "$sha"' > "$FAKE_BIN/curl"
chmod +x "$FAKE_BIN/curl"

printf '%s\n' '#!/usr/bin/env bash' 'exit "${FAKE_FLOCK_EXIT:-0}"' > "$FAKE_BIN/flock"
chmod +x "$FAKE_BIN/flock"
export PATH="$FAKE_BIN:$PATH"

# shellcheck source=release-lib.sh
. "$SCRIPT_DIR/release-lib.sh"

printf '{"status":"healthy","releaseSha":"%s"}\n' "$NEW_SHA" |
  health_response_matches "$NEW_SHA"
if printf '{"status":"healthy","releaseSha":"wrong"}\n' |
    health_response_matches "$NEW_SHA"; then
  echo 'health matcher accepted wrong SHA' >&2
  exit 1
fi

atomic_symlink "$OLD_SERVER" "$SOFTPROD_ROOT/current-server"
export FAKE_HEALTH_SHA="$NEW_SHA"
activate_release server "$NEW_SERVER"
[[ $(canonical_path "$SOFTPROD_ROOT/current-server") == "$NEW_SERVER" ]]
[[ $(canonical_path "$SOFTPROD_ROOT/previous-server") == "$OLD_SERVER" ]]
grep -q 'systemctl|--user restart questura-server' "$TEST_COMMAND_LOG"

# Same-target activation must preserve previous rollback target.
activate_release server "$NEW_SERVER"
[[ $(canonical_path "$SOFTPROD_ROOT/previous-server") == "$OLD_SERVER" ]]

# Failed activation restores current link and does not overwrite previous.
export FAKE_HEALTH_SHA=ffffffffffffffffffffffffffffffffffffffff
if activate_release server "$OLD_SERVER" > "$TEST_ROOT/failure.out" 2> "$TEST_ROOT/failure.err"; then
  echo 'activation unexpectedly succeeded with wrong health SHA' >&2
  exit 1
fi
[[ $(canonical_path "$SOFTPROD_ROOT/current-server") == "$NEW_SERVER" ]]
[[ $(canonical_path "$SOFTPROD_ROOT/previous-server") == "$OLD_SERVER" ]]
grep -q 'Activation failed; restoring server release' "$TEST_ROOT/failure.err"
unset FAKE_HEALTH_SHA

# Restart failure after symlink switch restores old release before returning.
atomic_symlink "$OLD_SERVER" "$SOFTPROD_ROOT/current-server"
atomic_symlink "$NEW_SERVER" "$SOFTPROD_ROOT/previous-server"
export FAIL_RESTART_MARKER="$TEST_ROOT/restart-failed"
if activate_release server "$NEW_SERVER" > "$TEST_ROOT/restart.out" 2> "$TEST_ROOT/restart.err"; then
  echo 'activation unexpectedly succeeded after restart failure' >&2
  exit 1
fi
unset FAIL_RESTART_MARKER
[[ $(canonical_path "$SOFTPROD_ROOT/current-server") == "$OLD_SERVER" ]]
[[ $(canonical_path "$SOFTPROD_ROOT/previous-server") == "$NEW_SERVER" ]]
grep -q 'Activation failed; restoring server release' "$TEST_ROOT/restart.err"

# Public mismatch fails activation even when local health matches target.
export FAIL_PUBLIC_SERVER_HEALTH=1
if activate_release server "$NEW_SERVER" > "$TEST_ROOT/public.out" 2> "$TEST_ROOT/public.err"; then
  echo 'activation ignored public health mismatch' >&2
  exit 1
fi
unset FAIL_PUBLIC_SERVER_HEALTH
[[ $(canonical_path "$SOFTPROD_ROOT/current-server") == "$OLD_SERVER" ]]
grep -q 'public server did not report release' "$TEST_ROOT/public.err"

# Bookkeeping failure restores component instead of reporting ambiguous state.
unlink "$SOFTPROD_ROOT/previous-server"
mkdir "$SOFTPROD_ROOT/previous-server"
if activate_release server "$NEW_SERVER" > "$TEST_ROOT/bookkeeping.out" 2> "$TEST_ROOT/bookkeeping.err"; then
  echo 'activation ignored previous-link bookkeeping failure' >&2
  exit 1
fi
[[ $(canonical_path "$SOFTPROD_ROOT/current-server") == "$OLD_SERVER" ]]
grep -q 'Activation bookkeeping failed' "$TEST_ROOT/bookkeeping.err"
rmdir "$SOFTPROD_ROOT/previous-server"

OUTSIDE="$TEST_ROOT/outside"
mkdir -p "$OUTSIDE"
if require_release_directory "$OUTSIDE" 2> "$TEST_ROOT/outside.err"; then
  echo 'outside release target accepted' >&2
  exit 1
fi
grep -q 'outside' "$TEST_ROOT/outside.err"

MALFORMED_SHA=3333333333333333333333333333333333333333
MALFORMED=$(make_release "$MALFORMED_SHA" server)
printf '%s\n' 'QUESTURA_RELEASE_SHA=short' > "$MALFORMED/.env.release"
if release_sha "$MALFORMED" 2> "$TEST_ROOT/metadata.err"; then
  echo 'malformed release metadata accepted' >&2
  exit 1
fi
grep -q 'exactly one full commit SHA' "$TEST_ROOT/metadata.err"

MISSING_SHA=5555555555555555555555555555555555555555
MISSING=$(make_release "$MISSING_SHA" server)
unlink "$MISSING/.env.release"
if release_sha "$MISSING" 2> "$TEST_ROOT/missing-metadata.err"; then
  echo 'release without metadata accepted' >&2
  exit 1
fi
grep -q 'release metadata is missing' "$TEST_ROOT/missing-metadata.err"

MISMATCH_SHA=4444444444444444444444444444444444444444
MISMATCH=$(make_release "$MISMATCH_SHA" server)
printf 'QUESTURA_RELEASE_SHA=%s\n' "$NEW_SHA" > "$MISMATCH/.env.release"
if release_sha "$MISMATCH" 2> "$TEST_ROOT/mismatch.err"; then
  echo 'mismatched release directory and metadata accepted' >&2
  exit 1
fi
grep -q 'does not match directory SHA' "$TEST_ROOT/mismatch.err"

if require_component_release_directory server "$NEW_CLIENT" 2> "$TEST_ROOT/component.err"; then
  echo 'client release accepted as server release' >&2
  exit 1
fi
grep -q 'not a server release directory' "$TEST_ROOT/component.err"

# Manual rollback swaps current and previous through the same checked activator.
atomic_symlink "$NEW_CLIENT" "$SOFTPROD_ROOT/current-client"
atomic_symlink "$OLD_CLIENT" "$SOFTPROD_ROOT/previous-client"
"$SCRIPT_DIR/rollback.sh" client > "$TEST_ROOT/rollback.out"
[[ $(canonical_path "$SOFTPROD_ROOT/current-client") == "$OLD_CLIENT" ]]
[[ $(canonical_path "$SOFTPROD_ROOT/previous-client") == "$NEW_CLIENT" ]]
grep -q 'Database remains on its current forward-migrated schema' "$TEST_ROOT/rollback.out"

# All-component rollback is client-first and leaves both on previous SHA.
atomic_symlink "$NEW_CLIENT" "$SOFTPROD_ROOT/current-client"
atomic_symlink "$OLD_CLIENT" "$SOFTPROD_ROOT/previous-client"
atomic_symlink "$NEW_SERVER" "$SOFTPROD_ROOT/current-server"
atomic_symlink "$OLD_SERVER" "$SOFTPROD_ROOT/previous-server"
: > "$TEST_COMMAND_LOG"
"$SCRIPT_DIR/rollback.sh" all > "$TEST_ROOT/rollback-all.out"
[[ $(canonical_path "$SOFTPROD_ROOT/current-client") == "$OLD_CLIENT" ]]
[[ $(canonical_path "$SOFTPROD_ROOT/current-server") == "$OLD_SERVER" ]]
client_restart=$(grep -n 'restart questura-client' "$TEST_COMMAND_LOG" | head -1 | cut -d: -f1)
server_restart=$(grep -n 'restart questura-server' "$TEST_COMMAND_LOG" | head -1 | cut -d: -f1)
((client_restart < server_restart))

# Mixed previous pointers abort before either component changes.
atomic_symlink "$NEW_CLIENT" "$SOFTPROD_ROOT/current-client"
atomic_symlink "$OLD_CLIENT" "$SOFTPROD_ROOT/previous-client"
atomic_symlink "$NEW_SERVER" "$SOFTPROD_ROOT/current-server"
atomic_symlink "$NEW_SERVER" "$SOFTPROD_ROOT/previous-server"
: > "$TEST_COMMAND_LOG"
if "$SCRIPT_DIR/rollback.sh" all > "$TEST_ROOT/mixed.out" 2> "$TEST_ROOT/mixed.err"; then
  echo 'all rollback accepted mismatched previous release SHAs' >&2
  exit 1
fi
[[ $(canonical_path "$SOFTPROD_ROOT/current-client") == "$NEW_CLIENT" ]]
[[ $(canonical_path "$SOFTPROD_ROOT/current-server") == "$NEW_SERVER" ]]
[[ ! -s $TEST_COMMAND_LOG ]]
grep -q 'do not form one deploy' "$TEST_ROOT/mixed.err"

# Failed server rollback moves client forward again; pair stays aligned.
atomic_symlink "$NEW_CLIENT" "$SOFTPROD_ROOT/current-client"
atomic_symlink "$OLD_CLIENT" "$SOFTPROD_ROOT/previous-client"
atomic_symlink "$NEW_SERVER" "$SOFTPROD_ROOT/current-server"
atomic_symlink "$OLD_SERVER" "$SOFTPROD_ROOT/previous-server"
export FAIL_SERVER_SHA="$OLD_SHA"
if "$SCRIPT_DIR/rollback.sh" all > "$TEST_ROOT/compensate.out" 2> "$TEST_ROOT/compensate.err"; then
  echo 'all rollback unexpectedly succeeded with failed server health' >&2
  exit 1
fi
unset FAIL_SERVER_SHA
[[ $(canonical_path "$SOFTPROD_ROOT/current-client") == "$NEW_CLIENT" ]]
[[ $(canonical_path "$SOFTPROD_ROOT/current-server") == "$NEW_SERVER" ]]
grep -q 'restoring client to match' "$TEST_ROOT/compensate.err"

# Failed client rollback restores original client and never touches server.
atomic_symlink "$NEW_CLIENT" "$SOFTPROD_ROOT/current-client"
atomic_symlink "$OLD_CLIENT" "$SOFTPROD_ROOT/previous-client"
atomic_symlink "$NEW_SERVER" "$SOFTPROD_ROOT/current-server"
atomic_symlink "$OLD_SERVER" "$SOFTPROD_ROOT/previous-server"
: > "$TEST_COMMAND_LOG"
export FAIL_CLIENT_SHA="$OLD_SHA"
if "$SCRIPT_DIR/rollback.sh" all > "$TEST_ROOT/client-failure.out" 2> "$TEST_ROOT/client-failure.err"; then
  echo 'all rollback unexpectedly succeeded with failed client health' >&2
  exit 1
fi
unset FAIL_CLIENT_SHA
[[ $(canonical_path "$SOFTPROD_ROOT/current-client") == "$NEW_CLIENT" ]]
[[ $(canonical_path "$SOFTPROD_ROOT/current-server") == "$NEW_SERVER" ]]
! grep -q 'restart questura-server' "$TEST_COMMAND_LOG"
grep -q 'Server was not changed' "$TEST_ROOT/client-failure.err"

# Corrupted client link makes restoration fail loudly; server stays untouched.
atomic_symlink "$NEW_CLIENT" "$SOFTPROD_ROOT/current-client"
atomic_symlink "$OLD_CLIENT" "$SOFTPROD_ROOT/previous-client"
: > "$TEST_COMMAND_LOG"
export SABOTAGE_CLIENT_LINK_MARKER="$TEST_ROOT/client-link-sabotaged"
if "$SCRIPT_DIR/rollback.sh" all > "$TEST_ROOT/client-restore.out" 2> "$TEST_ROOT/client-restore.err"; then
  echo 'all rollback ignored client restoration failure' >&2
  exit 1
fi
unset SABOTAGE_CLIENT_LINK_MARKER
[[ -d $SOFTPROD_ROOT/current-client && ! -L $SOFTPROD_ROOT/current-client ]]
[[ $(canonical_path "$SOFTPROD_ROOT/current-server") == "$NEW_SERVER" ]]
! grep -q 'restart questura-server' "$TEST_COMMAND_LOG"
grep -q 'original client restoration failed; server remains untouched' "$TEST_ROOT/client-restore.err"
rmdir "$SOFTPROD_ROOT/current-client"
atomic_symlink "$NEW_CLIENT" "$SOFTPROD_ROOT/current-client"

export FAKE_FLOCK_EXIT=73
if "$SCRIPT_DIR/rollback.sh" client > "$TEST_ROOT/lock.out" 2> "$TEST_ROOT/lock.err"; then
  echo 'rollback ignored lock contention' >&2
  exit 1
fi
unset FAKE_FLOCK_EXIT
grep -q 'already running' "$TEST_ROOT/lock.err"

echo 'release switching tests passed'
