#!/usr/bin/env bash
# Moving day: one database out of two (docs/procedures/cutover.md, step 5).
#
# The Mac and the laptop each hold half of the truth: the Mac has the newer
# content and schema, the laptop has the readers, members and payments. This
# takes a fresh dump of each and writes ONE merged dump, ready for step 6.
#
#   merge-databases.sh --mac mac.dump --laptop laptop.dump \
#     --scratch postgres://postgres@127.0.0.1:5471 --out /tmp/merge/merged.sql
#
#   --mac, --laptop   pg_dump -Fc files (the commands are in cutover.md)
#   --scratch         a THROWAWAY Postgres server (16 or newer) on this machine.
#                     It must hold no databases but its own: the real ones are
#                     never touched, only the two dump files are read.
#   --out             where the merged plain-SQL dump goes (mode 600, outside
#                     any git checkout: it holds readers' email addresses)
#   --accept-lost-laptop-edits
#                     merge even though the laptop edited content after the
#                     split that the Mac does not have (they are listed)
#   PG_BINDIR         where pg_restore/pg_dump/psql live (default: PATH)
#
# All the rules and checks are in merge-databases.sql, in one transaction.
# Then the merged dump is restored into a second scratch database and every
# table's row count is compared, so a dump that does not load is never handed
# on. Prints table names, ids and counts only; never a person's data.
set -Eeuo pipefail

die() { echo "merge-databases: $*" >&2; exit 1; }
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

MAC_DUMP='' LAPTOP_DUMP='' SCRATCH='' OUT='' ACCEPT_LOST=no
while [[ $# -gt 0 ]]; do
  case $1 in
    --mac) MAC_DUMP=${2:-}; shift 2 ;;
    --laptop) LAPTOP_DUMP=${2:-}; shift 2 ;;
    --scratch) SCRATCH=${2:-}; shift 2 ;;
    --out) OUT=${2:-}; shift 2 ;;
    --accept-lost-laptop-edits) ACCEPT_LOST=yes; shift ;;
    *) die "unknown argument: $1 (see the header of this script)" ;;
  esac
done
[[ -n $MAC_DUMP && -n $LAPTOP_DUMP && -n $SCRATCH && -n $OUT ]] ||
  die "usage: merge-databases.sh --mac FILE --laptop FILE --scratch postgres://USER@127.0.0.1:PORT --out FILE"

# --- Refuse anything that could be a real database --------------------------
# Only a loopback server on a port that is not one of the owner's: 5432 (the
# Mac's database), 5433 (the laptop's, tunnelled), 5442 (the readiness
# sandbox), 6379/6390 (Redis). No password, no query string: a throwaway
# server runs with trust auth, and a URI carrying a secret is a real one.
rest=${SCRATCH#postgres://}; rest=${rest#postgresql://}
[[ $rest != "$SCRATCH" ]] || die "--scratch must be a postgres:// URI"
[[ $rest != *\?* ]] || die "--scratch must not carry options"
hostport=${rest%%/*}
if [[ $hostport == *@* ]]; then userinfo=${hostport%@*}; hostport=${hostport#*@}; else userinfo=''; fi
[[ $userinfo != *:* ]] || die "--scratch must not carry a password: a throwaway server needs none"
host=${hostport%:*}; port=${hostport##*:}
[[ $hostport == *:* && $port =~ ^[0-9]+$ ]] || die "--scratch needs an explicit port"
case $host in 127.0.0.1|localhost|'[::1]') ;; *) die "--scratch must be on this machine (127.0.0.1), not $host" ;; esac
case $port in 5432|5433|5442|6379|6390) die "--scratch port $port belongs to a real or shared service" ;; esac
SERVER="postgres://${userinfo:+$userinfo@}$host:$port"
MERGE_DB=questura_merge
CHECK_DB=questura_merge_check

for f in "$MAC_DUMP" "$LAPTOP_DUMP"; do [[ -f $f && -r $f ]] || die "no such dump: $f"; done
out_dir=$(cd -- "$(dirname -- "$OUT")" 2>/dev/null && pwd) || die "--out directory does not exist"
if git -C "$out_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  die "--out is inside a git checkout; the merged dump holds personal data and must never be committed"
fi

bin() { if [[ -n ${PG_BINDIR:-} ]]; then echo "$PG_BINDIR/$1"; else command -v "$1"; fi; }
PSQL=$(bin psql) PG_RESTORE=$(bin pg_restore) PG_DUMP=$(bin pg_dump)
for b in "$PSQL" "$PG_RESTORE" "$PG_DUMP"; do [[ -x $b ]] || die "missing Postgres tool: $b (set PG_BINDIR)"; done
sql() { "$PSQL" "$SERVER/$1" -qAtX -v ON_ERROR_STOP=1 -c "$2"; }

for f in "$MAC_DUMP" "$LAPTOP_DUMP"; do
  "$PG_RESTORE" -l "$f" >/dev/null 2>&1 || die "$f is not a pg_dump -Fc file"
done

version=$(sql postgres 'show server_version_num') || die "cannot reach the scratch server"
(( version >= 160000 )) || die "the scratch server must be Postgres 16 or newer"
others=$(sql postgres "select string_agg(datname, ', ') from pg_database
  where datname not in ('postgres', 'template0', 'template1', '$MERGE_DB', '$CHECK_DB')")
[[ -z $others ]] || die "the scratch server holds other databases ($others); it must be a throwaway"

# --- Merge -------------------------------------------------------------------
umask 077
echo "merge-databases: scratch Postgres $version on port $port"
sql postgres "drop database if exists $MERGE_DB" >/dev/null 2>&1
sql postgres "drop database if exists $CHECK_DB" >/dev/null 2>&1
sql postgres "create database $MERGE_DB" >/dev/null

# The laptop's copy first, moved aside into schema `laptop`; then the Mac's,
# which becomes `public` and so the schema the merged database keeps.
"$PG_RESTORE" -d "$SERVER/$MERGE_DB" --no-owner --no-privileges --exit-on-error "$LAPTOP_DUMP"
sql "$MERGE_DB" 'alter schema public rename to laptop; create schema public' >/dev/null
"$PG_RESTORE" -d "$SERVER/$MERGE_DB" --no-owner --no-privileges --exit-on-error "$MAC_DUMP"
echo "merge-databases: both copies restored; merging"

PGOPTIONS="-c merge.accept_lost_laptop_edits=$ACCEPT_LOST" \
  "$PSQL" "$SERVER/$MERGE_DB" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f "$SCRIPT_DIR/merge-databases.sql" | sed 's/^/  /'

"$PG_DUMP" "$SERVER/$MERGE_DB" --no-owner --no-privileges > "$OUT"
chmod 600 "$OUT"

# --- The merged dump loads, the way cutover step 6 loads it -------------------
sql postgres "create database $CHECK_DB" >/dev/null
"$PSQL" "$SERVER/$CHECK_DB" -qX -v ON_ERROR_STOP=1 --single-transaction -f "$OUT" >/dev/null
counts='select string_agg(format($$%s=%s$$, table_name,
  (xpath($$/row/c/text()$$, query_to_xml(format($$select count(*) as c from public.%I$$, table_name), false, true, $$$$)))[1]::text), $$ $$ order by table_name)
  from information_schema.tables where table_schema = $$public$$ and table_type = $$BASE TABLE$$'
[[ $(sql "$MERGE_DB" "$counts") == "$(sql "$CHECK_DB" "$counts")" ]] ||
  die "the merged dump does not restore to the same row counts"
sql postgres "drop database $CHECK_DB" >/dev/null
sql postgres "drop database $MERGE_DB" >/dev/null

echo "merge-databases: wrote $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes); it restores with identical row counts"
echo "merge-databases: next, cutover.md step 6 loads it; step 7 compares the counts above"
