#!/usr/bin/env bash
# The daily copy of the Questura database that lives outside Neon (D7).
#
# Neon's point-in-time restore covers "we broke something in the last 7
# days". This covers "Neon itself is the problem": the account, the project
# or the branch history is gone. It takes one logical dump, proves it
# restores, and only then stores it where Neon cannot reach it.
#
#   1. refuse unless pg_dump is at least the server's major version;
#   2. pg_dump -Fc from the source (a read-only role on the direct endpoint);
#   3. pg_restore it, one transaction, stop on the first error, into an
#      EMPTY verification database, and require the core tables to have rows;
#   4. store the dump and its sha256: to S3-compatible storage (Cloudflare R2)
#      when QUESTURA_BACKUP_S3_URI is set, otherwise to QUESTURA_BACKUP_DIR.
#
# A dump that does not restore is never uploaded, and the run fails.
#
# Environment:
#   QUESTURA_BACKUP_DATABASE_URL  source, e.g. Neon's direct endpoint (required)
#   QUESTURA_BACKUP_VERIFY_URL    an empty, disposable database on the same
#                                 major (required; refused if it has tables)
#   QUESTURA_BACKUP_S3_URI        e.g. s3://questura-db-backups/daily
#   QUESTURA_BACKUP_S3_ENDPOINT   e.g. https://<account id>.r2.cloudflarestorage.com
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   the bucket's R2 API token
#   QUESTURA_BACKUP_DIR           local directory, used when no S3 URI is set
#   PG_BINDIR                     where pg_dump/pg_restore/psql live (optional)
#
# Never prints a connection string: the repository is public, so is the log.
# Procedure: apps/questura/docs/procedures/backup-restore-rollback.md.
set -Eeuo pipefail

die() { echo "daily-dump: $*" >&2; exit 1; }

: "${QUESTURA_BACKUP_DATABASE_URL:?QUESTURA_BACKUP_DATABASE_URL is required}"
: "${QUESTURA_BACKUP_VERIFY_URL:?QUESTURA_BACKUP_VERIFY_URL is required}"
if [[ -z ${QUESTURA_BACKUP_S3_URI:-} && -z ${QUESTURA_BACKUP_DIR:-} ]]; then
  die "set QUESTURA_BACKUP_S3_URI (with QUESTURA_BACKUP_S3_ENDPOINT) or QUESTURA_BACKUP_DIR"
fi
if [[ -n ${QUESTURA_BACKUP_S3_URI:-} && -z ${QUESTURA_BACKUP_S3_ENDPOINT:-} ]]; then
  die "QUESTURA_BACKUP_S3_ENDPOINT is required with QUESTURA_BACKUP_S3_URI"
fi
[[ $QUESTURA_BACKUP_DATABASE_URL != "$QUESTURA_BACKUP_VERIFY_URL" ]] \
  || die "the verification database must not be the source"

tool() { if [[ -n ${PG_BINDIR:-} ]]; then echo "$PG_BINDIR/$1"; else echo "$1"; fi; }
PG_DUMP=$(tool pg_dump)
PG_RESTORE=$(tool pg_restore)
PSQL=$(tool psql)

query() { "$PSQL" "$1" -X -q -v ON_ERROR_STOP=1 -tA -c "$2"; }

# --- 1. A client that can dump this server -----------------------------------
server_num=$(query "$QUESTURA_BACKUP_DATABASE_URL" 'SHOW server_version_num')
server_major=$((server_num / 10000))
client_major=$("$PG_DUMP" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
[[ $client_major =~ ^[0-9]+$ ]] || die "cannot read the pg_dump version"
if (( client_major < server_major )); then
  die "pg_dump $client_major cannot dump a Postgres $server_major server; install the $server_major client or set PG_BINDIR"
fi
echo "==> Source is Postgres $server_major, pg_dump $client_major"

# The verification database must be empty: this script never restores over data.
existing=$(query "$QUESTURA_BACKUP_VERIFY_URL" "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
[[ $existing == 0 ]] || die "the verification database is not empty ($existing tables); refusing to restore into it"

WORK=$(mktemp -d)
trap 'rm -rf -- "$WORK"' EXIT
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
NAME="questura-$STAMP.dump"
DUMP="$WORK/$NAME"

# --- 2. Dump -------------------------------------------------------------------
started=$(date +%s)
"$PG_DUMP" "$QUESTURA_BACKUP_DATABASE_URL" -Fc --no-owner --no-privileges -f "$DUMP"
echo "==> Dumped $(wc -c < "$DUMP") bytes in $(( $(date +%s) - started )) s"

# --- 3. Prove it restores --------------------------------------------------------
started=$(date +%s)
"$PG_RESTORE" -d "$QUESTURA_BACKUP_VERIFY_URL" --no-owner --no-privileges --exit-on-error --single-transaction "$DUMP"
counts=$(query "$QUESTURA_BACKUP_VERIFY_URL" "SELECT concat_ws(' ',
  'locations=' || (SELECT count(*) FROM locations),
  'articles=' || (SELECT count(*) FROM articles),
  'media_assets=' || (SELECT count(*) FROM media_assets),
  'visitor_auth_users=' || (SELECT count(*) FROM visitor_auth_users),
  'payload_migrations=' || (SELECT count(*) FROM payload_migrations))")
echo "==> Restored in $(( $(date +%s) - started )) s: $counts"
for required in locations articles payload_migrations; do
  [[ $counts =~ (^| )$required=([0-9]+) ]] || die "no count for $required"
  (( BASH_REMATCH[2] > 0 )) || die "the restored $required table is empty; not storing this dump"
done

# --- 4. Store it outside Neon ------------------------------------------------------
if command -v sha256sum > /dev/null; then
  ( cd "$WORK" && sha256sum "$NAME" > "$NAME.sha256" )
else
  ( cd "$WORK" && shasum -a 256 "$NAME" > "$NAME.sha256" )
fi
if [[ -n ${QUESTURA_BACKUP_S3_URI:-} ]]; then
  destination="${QUESTURA_BACKUP_S3_URI%/}"
  aws s3 cp --only-show-errors --endpoint-url "$QUESTURA_BACKUP_S3_ENDPOINT" "$DUMP" "$destination/$NAME"
  aws s3 cp --only-show-errors --endpoint-url "$QUESTURA_BACKUP_S3_ENDPOINT" "$DUMP.sha256" "$destination/$NAME.sha256"
  echo "==> Stored $NAME in the off-Neon bucket"
else
  mkdir -p "$QUESTURA_BACKUP_DIR"
  cp "$DUMP" "$DUMP.sha256" "$QUESTURA_BACKUP_DIR/"
  echo "==> Stored $QUESTURA_BACKUP_DIR/$NAME"
fi
