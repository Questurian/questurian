#!/usr/bin/env bash
# daily-dump.sh with fake Postgres tools and a fake aws: what is refused,
# what is uploaded, in which order, and that no connection string is printed.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT
BIN="$TEST_ROOT/bin"
LOG="$TEST_ROOT/commands.log"
OUT="$TEST_ROOT/out.log"
mkdir -p "$BIN"

# psql answers the three queries the script makes; FAKE_* steer the answers.
cat > "$BIN/psql" <<'EOF'
#!/usr/bin/env bash
printf 'psql %s\n' "$1" >> "$DUMP_TEST_LOG"
sql="${*: -1}"
case $sql in
  *server_version_num*) echo "${FAKE_SERVER_NUM:-170011}" ;;
  *information_schema.tables*) echo "${FAKE_VERIFY_TABLES:-0}" ;;
  *locations=*) echo "locations=${FAKE_LOCATIONS:-13} articles=29 media_assets=8 visitor_auth_users=4 payload_migrations=49" ;;
  *) echo "unexpected query" >&2; exit 9 ;;
esac
EOF
cat > "$BIN/pg_dump" <<'EOF'
#!/usr/bin/env bash
if [[ $1 == --version ]]; then echo "pg_dump (PostgreSQL) ${FAKE_CLIENT_MAJOR:-17}.11"; exit 0; fi
printf 'pg_dump %s\n' "$*" >> "$DUMP_TEST_LOG"
out=""; while (( $# )); do [[ $1 == -f ]] && out=$2; shift; done
printf 'PGDMP fake' > "$out"
EOF
cat > "$BIN/pg_restore" <<'EOF'
#!/usr/bin/env bash
printf 'pg_restore %s\n' "$*" >> "$DUMP_TEST_LOG"
[[ ${FAIL_RESTORE:-0} == 1 ]] && exit 1
exit 0
EOF
cat > "$BIN/aws" <<'EOF'
#!/usr/bin/env bash
printf 'aws %s\n' "$*" >> "$DUMP_TEST_LOG"
EOF
chmod +x "$BIN"/*

SOURCE='postgres://reader:s3cret-source@ep-example.neon.tech/questura?sslmode=require'
VERIFY='postgres://postgres:s3cret-verify@127.0.0.1:5432/verify'

run() {
  : > "$LOG"
  env -i PATH="$BIN:/usr/bin:/bin" HOME="$TEST_ROOT" DUMP_TEST_LOG="$LOG" \
    QUESTURA_BACKUP_DATABASE_URL="$SOURCE" QUESTURA_BACKUP_VERIFY_URL="$VERIFY" "$@" \
    bash "$SCRIPT_DIR/daily-dump.sh" > "$OUT" 2>&1
}
fail() {
  echo "daily-dump test failed: $1" >&2
  echo "--- commands" >&2; cat "$LOG" >&2
  echo "--- output" >&2; cat "$OUT" >&2
  exit 1
}
S3=(QUESTURA_BACKUP_S3_URI=s3://questura-db-backups/daily/ QUESTURA_BACKUP_S3_ENDPOINT=https://acct.r2.cloudflarestorage.com)

# 1. Happy path to S3: dump, restore, then both uploads, in that order.
run "${S3[@]}" || fail "happy path exited non-zero"
order=$(grep -oE '^(pg_dump|pg_restore|aws)' "$LOG" | tr '\n' ' ')
[[ $order == "pg_dump pg_restore aws aws " ]] || fail "unexpected order: $order"
grep -q 'pg_dump .* -Fc --no-owner --no-privileges' "$LOG" || fail "not a custom-format dump"
grep -q 'pg_restore .*--exit-on-error --single-transaction' "$LOG" || fail "restore does not stop on error in one transaction"
grep -qE '^aws s3 cp --only-show-errors --endpoint-url https://acct.r2.cloudflarestorage.com .*/questura-[0-9]{8}T[0-9]{6}Z\.dump s3://questura-db-backups/daily/questura-[0-9]{8}T[0-9]{6}Z\.dump$' "$LOG" \
  || fail "dump not uploaded to the bucket prefix"
grep -q '\.dump\.sha256 s3://questura-db-backups/daily/questura-.*\.dump\.sha256$' "$LOG" || fail "checksum not uploaded"
grep -q 's3cret' "$OUT" && fail "a connection string was printed"

# 2. Restore fails: nothing is uploaded.
if run "${S3[@]}" FAIL_RESTORE=1; then fail "a failed restore did not fail the run"; fi
grep -q '^aws' "$LOG" && fail "uploaded a dump that did not restore"

# 3. The restore came back without content: nothing is uploaded.
if run "${S3[@]}" FAKE_LOCATIONS=0; then fail "an empty restore did not fail the run"; fi
grep -q '^aws' "$LOG" && fail "uploaded a dump whose restore was empty"

# 4. pg_dump older than the server: refused before dumping.
if run "${S3[@]}" FAKE_CLIENT_MAJOR=16; then fail "pg_dump 16 against Postgres 17 was not refused"; fi
grep -q '^pg_dump' "$LOG" && fail "dumped with a too-old pg_dump"
grep -q 'cannot dump a Postgres 17 server' "$OUT" || fail "version refusal not explained"

# 5. A verification database with tables in it: refused before dumping.
if run "${S3[@]}" FAKE_VERIFY_TABLES=114; then fail "restored into a non-empty database"; fi
grep -qE '^(pg_dump|pg_restore)' "$LOG" && fail "dumped or restored with a non-empty verification database"

# 6. Verification database equal to the source: refused before anything runs.
if run "${S3[@]}" QUESTURA_BACKUP_VERIFY_URL="$SOURCE"; then fail "verify == source was not refused"; fi
[[ -s $LOG ]] && fail "ran commands with verify == source"

# 7. No destination: refused. S3 URI without an endpoint: refused.
if run; then fail "ran without a destination"; fi
if run QUESTURA_BACKUP_S3_URI=s3://b/p; then fail "ran S3 without an endpoint"; fi

# 8. Local directory destination: dump and checksum land there, no aws call.
run QUESTURA_BACKUP_DIR="$TEST_ROOT/local" || fail "local destination exited non-zero"
grep -q '^aws' "$LOG" && fail "called aws for a local destination"
ls "$TEST_ROOT"/local/questura-*.dump "$TEST_ROOT"/local/questura-*.dump.sha256 > /dev/null 2>&1 || fail "local files missing"

echo "daily backup tests passed"
