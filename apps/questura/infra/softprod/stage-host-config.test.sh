#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

DEPLOY_ROOT="$TEST_ROOT/host"
APP_ROOT="$TEST_ROOT/app"
FAKE_BIN="$TEST_ROOT/bin"
LOG="$TEST_ROOT/commands.log"
EXPECTED_COMPOSE_ENV="$TEST_ROOT/expected-compose.env"
mkdir -p \
  "$APP_ROOT/apps/questura/apps/server" \
  "$APP_ROOT/apps/questura/apps/client" \
  "$DEPLOY_ROOT/infra" \
  "$FAKE_BIN"
printf '%s\n' 'DATABASE_URI=postgres://fixture' > "$APP_ROOT/apps/questura/apps/server/.env"
printf '%s\n' 'NEXT_PUBLIC_SERVER_URL=https://cms.questurian.com' > "$APP_ROOT/apps/questura/apps/client/.env.production.local"
printf '%s\n' \
  'services:' \
  '  postgres:' \
  '    environment:' \
  '      POSTGRES_PASSWORD: fixture-password' > "$DEPLOY_ROOT/infra/compose.yml"
FAKE_COMPOSE_PASSWORD=$'fixture\\path\'quote$dollar\nline2'
printf '%s\n' "POSTGRES_PASSWORD=\"fixture\\\\path'quote\$\$dollar\\nline2\"" > "$EXPECTED_COMPOSE_ENV"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "docker|%s\\n" "$*" >> "$HOST_CONFIG_TEST_LOG"' \
  'if [[ $* == *"--env-file"* ]]; then' \
  '  previous=""; env_file=""; for argument in "$@"; do if [[ $previous == --env-file ]]; then env_file=$argument; break; fi; previous=$argument; done' \
  '  cmp "$EXPECTED_COMPOSE_ENV" "$env_file"' \
  'fi' \
  'if [[ $* == *"--format json"* ]]; then python3 -c '\''import json,os; print(json.dumps({"services":{"postgres":{"environment":{"POSTGRES_PASSWORD":os.environ["FAKE_COMPOSE_PASSWORD"]}}}}))'\''; fi' > "$FAKE_BIN/docker"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "cloudflared|%s\\n" "$*" >> "$HOST_CONFIG_TEST_LOG"' > "$FAKE_BIN/cloudflared"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "systemd-analyze|%s\\n" "$*" >> "$HOST_CONFIG_TEST_LOG"' > "$FAKE_BIN/systemd-analyze"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$FAKE_BIN/pnpm"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ ${FAIL_FLOCK:-0} == 1 ]]; then exit 73; fi' > "$FAKE_BIN/flock"
chmod +x "$FAKE_BIN"/*

run_installer() {
  env \
    PATH="$FAKE_BIN:$PATH" \
    QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT" \
    QUESTURA_APP_ROOT="$APP_ROOT" \
    QUESTURA_PNPM_BIN="$FAKE_BIN/pnpm" \
    QUESTURA_NODE_BIN_DIR="$FAKE_BIN" \
    QUESTURA_CLOUDFLARED_BIN="$FAKE_BIN/cloudflared" \
    HOST_CONFIG_TEST_LOG="$LOG" \
    EXPECTED_COMPOSE_ENV="$EXPECTED_COMPOSE_ENV" \
    FAKE_COMPOSE_PASSWORD="$FAKE_COMPOSE_PASSWORD" \
    FAIL_FLOCK="${FAIL_FLOCK:-0}" \
    "$SCRIPT_DIR/stage-host-config.sh"
}

run_installer > "$TEST_ROOT/install.out" 2> "$TEST_ROOT/install.err"
cmp "$APP_ROOT/apps/questura/apps/server/.env" "$DEPLOY_ROOT/config/server.env"
cmp "$APP_ROOT/apps/questura/apps/client/.env.production.local" "$DEPLOY_ROOT/config/client.env"
cmp "$SCRIPT_DIR/host/compose.yml" "$DEPLOY_ROOT/infra/compose.yml"
cmp "$SCRIPT_DIR/host/tunnel-config.yml" "$DEPLOY_ROOT/infra/tunnel-config.yml"
cmp "$EXPECTED_COMPOSE_ENV" "$DEPLOY_ROOT/infra/.env"
[[ $(stat -c '%a' "$DEPLOY_ROOT/infra/.env" 2>/dev/null || stat -f '%Lp' "$DEPLOY_ROOT/infra/.env") == 600 ]]
[[ $(stat -c '%a' "$DEPLOY_ROOT/config/server.env" 2>/dev/null || stat -f '%Lp' "$DEPLOY_ROOT/config/server.env") == 600 ]]
grep -q "ExecStart=$FAKE_BIN/pnpm exec next start -H 127.0.0.1 -p 4000" "$DEPLOY_ROOT/infra/systemd/questura-server.service"
grep -q "ExecStart=$FAKE_BIN/cloudflared" "$DEPLOY_ROOT/infra/systemd/questura-tunnel.service"
grep -q 'ExecStart=/usr/bin/env bash %h/questura/app/apps/questura/infra/softprod/healthcheck.sh' "$DEPLOY_ROOT/infra/systemd/questura-healthcheck.service"
grep -q '^OnBootSec=2min$' "$DEPLOY_ROOT/infra/systemd/questura-healthcheck.timer"
grep -q '^OnCalendar=\*:0/5$' "$DEPLOY_ROOT/infra/systemd/questura-healthcheck.timer"
grep -q '^Persistent=true$' "$DEPLOY_ROOT/infra/systemd/questura-healthcheck.timer"
grep -q 'ExecStart=/usr/bin/env bash %h/questura/app/apps/questura/infra/softprod/reconcile.sh' "$DEPLOY_ROOT/infra/systemd/questura-reconcile.service"
# The host's /usr/bin/node is v18 and the release expects 22, so the nvm bin
# directory has to lead PATH or the nightly runs on the wrong Node.
grep -q "^Environment=PATH=$FAKE_BIN:" "$DEPLOY_ROOT/infra/systemd/questura-reconcile.service"
grep -q '^OnCalendar=\*-\*-\* 04:20$' "$DEPLOY_ROOT/infra/systemd/questura-reconcile.timer"
# A laptop asleep at 04:20 must still run the missed job on wake.
grep -q '^Persistent=true$' "$DEPLOY_ROOT/infra/systemd/questura-reconcile.timer"
! rg -q '@(NODE_BIN_DIR|PNPM_BIN|CLOUDFLARED_BIN)@' "$DEPLOY_ROOT/infra/systemd"
grep -q 'docker|.*config --quiet' "$LOG"
grep -q 'cloudflared|.*tunnel ingress validate' "$LOG"
grep -q 'systemd-analyze|--user verify' "$LOG"
grep -q 'systemd-analyze|.*questura-healthcheck.service.*questura-healthcheck.timer' "$LOG"
! grep -Fq "$FAKE_COMPOSE_PASSWORD" "$TEST_ROOT/install.out" "$TEST_ROOT/install.err"

# Idempotent rerun keeps secrets quiet and creates another recoverable backup.
run_installer > "$TEST_ROOT/repeat.out" 2> "$TEST_ROOT/repeat.err"
[[ $(find "$DEPLOY_ROOT/backups/host-config" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ') == 2 ]]
! grep -Fq "$FAKE_COMPOSE_PASSWORD" "$TEST_ROOT/repeat.out" "$TEST_ROOT/repeat.err"

# Canonical-config drift aborts instead of overwriting operator-owned values.
printf '%s\n' 'DATABASE_URI=postgres://changed' > "$APP_ROOT/apps/questura/apps/server/.env"
set +e
run_installer > "$TEST_ROOT/drift.out" 2> "$TEST_ROOT/drift.err"
drift_code=$?
set -e
[[ $drift_code == 1 ]]
grep -q 'refusing overwrite' "$TEST_ROOT/drift.err"
grep -Fxq 'DATABASE_URI=postgres://fixture' "$DEPLOY_ROOT/config/server.env"

set +e
FAIL_FLOCK=1 run_installer > "$TEST_ROOT/lock.out" 2> "$TEST_ROOT/lock.err"
lock_code=$?
set -e
[[ $lock_code == 1 ]]
grep -q 'another Questura deploy or host-config operation is running' "$TEST_ROOT/lock.err"

echo 'host-config staging tests passed'
