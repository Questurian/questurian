#!/usr/bin/env bash
# Host glue for the nightly Stripe reconciliation.
#
# Throwaway by design. All this does is find the current release, hand it the
# environment, keep a dated report, and leave a status file the healthcheck can
# read. The orchestration lives in `scripts/nightly-stripe-reconcile.ts`, which
# travels with the repository; delete this file and the systemd units at
# migration and point serverless cron at `pnpm reconcile:nightly` instead.
#
# Unlike healthcheck.sh, this **holds** the deploy lock for the whole run.
# The healthcheck is passive and must never block a deploy; this writes to
# Postgres while `deploy.sh` may be running migrations, and the two must not
# interleave.
#
# Exit codes:
#   0   the orchestrator exited 0, or a deploy was active and the run was skipped
#   1   the orchestrator exited non-zero: a human is needed
#   2   this wrapper could not set up the run (bad release pointer, missing env)
set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_ROOT=${QUESTURA_DEPLOY_ROOT:-"$HOME/questura"}
RELEASES_ROOT=${QUESTURA_RELEASES_ROOT:-"$DEPLOY_ROOT/releases"}
CONFIG_ROOT=${QUESTURA_CONFIG_ROOT:-"$DEPLOY_ROOT/config"}
# Deliberately not ~/questura/logs: that directory holds the append-only
# server/client/tunnel logs and has a different lifecycle and retention.
REPORTS_ROOT=${QUESTURA_REPORTS_ROOT:-"$DEPLOY_ROOT/reports"}
LOCK_WAIT_SECONDS=${QUESTURA_RECONCILE_LOCK_WAIT_SECONDS:-900}
RETENTION_DAYS=${QUESTURA_RECONCILE_REPORT_RETENTION_DAYS:-30}

APPLY=${QUESTURA_RECONCILE_APPLY:-1}
MAX_APPLY=${QUESTURA_RECONCILE_MAX_APPLY:-25}
export QUESTURA_RECONCILE_APPLY="$APPLY"
export QUESTURA_RECONCILE_MAX_APPLY="$MAX_APPLY"

export QUESTURA_DEPLOY_ROOT="$DEPLOY_ROOT"
export QUESTURA_RELEASES_ROOT="$RELEASES_ROOT"
# shellcheck source=release-lib.sh
. "$SCRIPT_DIR/release-lib.sh"

# Written before anything can fail, so the healthcheck's freshness probe can
# tell "never adopted" (directory absent) from "the last run failed".
write_status() {
  local status=$1
  local code=$2
  local temporary

  temporary=$(mktemp "$REPORTS_ROOT/.reconcile-status.XXXXXX") || return 1
  printf 'status=%s exit=%s finished_at=%s\n' "$status" "$code" "$(date -u +%s)" > "$temporary"
  chmod 0600 "$temporary"
  mv -f -- "$temporary" "$REPORTS_ROOT/reconcile-status"
}

fail_setup() {
  printf 'FAIL check=reconcile reason=%s\n' "$1" >&2
  write_status fail 2
  exit 2
}

# One writer at a time, shared with deploy.sh and stage-host-config.sh. Held for
# the whole run and released when this shell exits.
mkdir -p "$DEPLOY_ROOT" || {
  printf 'FAIL check=reconcile reason=deploy-root-unwritable\n' >&2
  exit 2
}
if ! exec 9>"$DEPLOY_ROOT/deploy.lock"; then
  printf 'FAIL check=reconcile reason=lock-unavailable\n' >&2
  exit 2
fi
if ! flock -w "$LOCK_WAIT_SECONDS" 9; then
  # Not a failure and not a status-file event: a deploy owns the host right now.
  # The 36h staleness window in healthcheck.sh covers a deploy that never ends.
  printf '%s\n' 'SKIP check=reconcile reason=deploy-active'
  exit 0
fi

mkdir -p "$REPORTS_ROOT" || {
  printf 'FAIL check=reconcile reason=reports-root-unwritable\n' >&2
  exit 2
}
# Reports carry visitor email addresses and Stripe customer IDs. Same data the
# manual scripts already print to a terminal, but a file persists.
chmod 0700 "$REPORTS_ROOT" || fail_setup reports-root-unprotected

server_link="$DEPLOY_ROOT/current-server"
[[ -L $server_link ]] || fail_setup missing-current-server
release_directory=$(canonical_path "$server_link" 2>/dev/null) || fail_setup unresolvable-current-server
require_component_release_directory server "$release_directory" || fail_setup invalid-current-server
release_commit=$(release_sha "$release_directory" 2>/dev/null) || fail_setup unreadable-release-metadata

# The timer gets its environment from `EnvironmentFile=`; a manual run gets it
# from here, so both behave the same. Only sourced when the key is absent, so an
# operator can override the environment for one deliberate run.
if [[ -z ${STRIPE_SECRET_KEY:-} ]]; then
  [[ -r $CONFIG_ROOT/server.env ]] || fail_setup missing-server-env
  set -a
  # shellcheck source=/dev/null
  . "$CONFIG_ROOT/server.env" || fail_setup unreadable-server-env
  set +a
fi
[[ -n ${STRIPE_SECRET_KEY:-} ]] || fail_setup missing-stripe-key

report_file="$REPORTS_ROOT/reconcile-$(date -u +%Y-%m-%d).log"
if [[ ! -e $report_file ]]; then
  (umask 0077; : > "$report_file") || fail_setup report-unwritable
fi
chmod 0600 "$report_file" || fail_setup report-unprotected

# Appended, not truncated, so a second run on the same UTC day — a manual one
# after a failure, most likely — cannot erase the evidence from the first.
{
  printf '=== reconcile start utc=%s release_sha=%s apply=%s max_apply=%s ===\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$release_commit" "$APPLY" "$MAX_APPLY"
  (cd -- "$release_directory" && pnpm exec tsx scripts/nightly-stripe-reconcile.ts)
} 2>&1 | tee -a -- "$report_file"
child_status=${PIPESTATUS[0]}

if ((child_status == 0)); then
  status=ok
else
  status=fail
fi
write_status "$status" "$child_status" || printf 'FAIL check=reconcile reason=status-unwritable\n' >&2

# Symlinked rather than copied so `reconcile-latest.log` cannot drift from the
# dated file it names.
atomic_symlink "$report_file" "$REPORTS_ROOT/reconcile-latest.log" ||
  printf 'FAIL check=reconcile reason=latest-symlink-failed\n' >&2

# `-type f` leaves reconcile-latest.log alone; reconcile-status is not a .log.
find "$REPORTS_ROOT" -maxdepth 1 -type f -name 'reconcile-*.log' \
  -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

printf '%s check=reconcile exit=%s release_sha=%s report=%s\n' \
  "$([[ $status == ok ]] && printf OK || printf FAIL)" \
  "$child_status" "$release_commit" "$report_file"
exit "$child_status"
