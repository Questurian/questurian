#!/usr/bin/env bash
# merge-databases.sh: what it refuses, and (given a throwaway Postgres) what it
# merges and which checks stop it.
#
#   bash scripts/cutover/merge-databases.test.sh
#       the refusals only; needs no database (runs in CI via test:softprod)
#   MERGE_TEST_SCRATCH=postgres://postgres@127.0.0.1:5471 PG_BINDIR=<pg 16+ bin> \
#     bash scripts/cutover/merge-databases.test.sh
#       also merges two small synthetic databases on that throwaway server.
#       The server must hold nothing else: the script refuses otherwise.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
MERGE="$SCRIPT_DIR/merge-databases.sh"
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT
OUTPUT="$TEST_ROOT/output.log"

fail() { echo "merge-databases test failed: $1" >&2; echo "--- output" >&2; cat "$OUTPUT" >&2; exit 1; }
refuses() { # refuses <expected message> <args...>
  local expected=$1; shift
  if bash "$MERGE" "$@" > "$OUTPUT" 2>&1; then fail "accepted: $*"; fi
  grep -qF -- "$expected" "$OUTPUT" || fail "wrong refusal for $* (wanted: $expected)"
}

# --- 1. Refusals that need no database -------------------------------------------
touch "$TEST_ROOT/mac.dump" "$TEST_ROOT/laptop.dump"
dumps=(--mac "$TEST_ROOT/mac.dump" --laptop "$TEST_ROOT/laptop.dump")
out=(--out "$TEST_ROOT/merged.sql")

refuses 'usage:' "${dumps[@]}"
refuses 'must be a postgres:// URI' "${dumps[@]}" "${out[@]}" --scratch mysql://127.0.0.1:5471
refuses 'must be on this machine' "${dumps[@]}" "${out[@]}" --scratch postgres://postgres@db.example.com:5471
refuses 'must be on this machine' "${dumps[@]}" "${out[@]}" --scratch postgres://postgres@ep-quiet.neon.tech:5432/neondb
refuses 'needs an explicit port' "${dumps[@]}" "${out[@]}" --scratch postgres://postgres@127.0.0.1
refuses 'must not carry a password' "${dumps[@]}" "${out[@]}" --scratch postgres://questura:secret@127.0.0.1:5471
refuses 'must not carry options' "${dumps[@]}" "${out[@]}" --scratch 'postgres://postgres@127.0.0.1:5471/x?sslmode=require'
for port in 5432 5433 5442 6379 6390; do
  refuses "port $port belongs to a real or shared service" "${dumps[@]}" "${out[@]}" --scratch "postgres://postgres@127.0.0.1:$port"
done
refuses 'no such dump' --mac "$TEST_ROOT/nope.dump" --laptop "$TEST_ROOT/laptop.dump" "${out[@]}" --scratch postgres://postgres@127.0.0.1:5471
refuses 'inside a git checkout' "${dumps[@]}" --out "$SCRIPT_DIR/merged.sql" --scratch postgres://postgres@127.0.0.1:5471
refuses 'unknown argument' "${dumps[@]}" "${out[@]}" --scratch postgres://postgres@127.0.0.1:5471 --force
[[ ! -e $SCRIPT_DIR/merged.sql ]] || fail "wrote a dump inside the checkout"
echo "merge-databases test: refusals ok"

if [[ -z ${MERGE_TEST_SCRATCH:-} ]]; then
  echo "merge-databases test: MERGE_TEST_SCRATCH not set; skipping the merge itself"
  exit 0
fi

# --- 2. The merge, on synthetic data --------------------------------------------
PSQL="${PG_BINDIR:+$PG_BINDIR/}psql" PG_DUMP="${PG_BINDIR:+$PG_BINDIR/}pg_dump"
SCRATCH=$MERGE_TEST_SCRATCH
q() { "$PSQL" "$SCRATCH/$1" -qAtX -v ON_ERROR_STOP=1 -c "$2"; }
run_sql() { "$PSQL" "$SCRATCH/$1" -qX -v ON_ERROR_STOP=1 >/dev/null; }

# Both copies share this schema and the rows that existed at the split.
common_sql=$(cat <<'SQL'
create table payload_migrations (id serial primary key, name varchar, created_at timestamptz not null);
insert into payload_migrations (name, created_at) values ('m1', '2026-01-01');
create table users (id serial primary key, email varchar not null);
insert into users (email) values ('staff@questurian.test');
create table visitor_auth_users (id text primary key, email text not null unique);
create table visitor_auth_accounts (id text primary key, "userId" text not null references visitor_auth_users(id));
create table visitor_auth_sessions (id text primary key, "userId" text not null references visitor_auth_users(id));
create table visitor_auth_verifications (id text primary key);
create table visitor_auth_rate_limits (id text primary key);
create type enum_visitor_profiles_subscription_status as enum ('none', 'active');
create table visitor_profiles (id serial primary key, auth_user_id varchar not null unique,
  subscription_status enum_visitor_profiles_subscription_status not null default 'none',
  stripe_customer_id varchar unique, updated_at timestamptz not null default now());
create table stripe_webhook_events (id serial primary key, event_id varchar not null);
create table email_logs (id serial primary key, status varchar);
create table service_accounts (id serial primary key, api_key varchar);
insert into service_accounts (api_key) values ('hash-a');
create table identity_email_owners (normalized_email text primary key, owner_kind text not null, owner_id text not null);
insert into identity_email_owners values ('staff@questurian.test', 'staff', '1');
create table payload_locked_documents (id serial primary key);
create table payload_locked_documents_rels (id serial primary key, parent_id int references payload_locked_documents(id));
create table articles (id serial primary key, title varchar, access varchar not null default 'free',
  author_id int, updated_at timestamptz not null);
insert into articles (title, author_id, updated_at) select 'a' || g, 1, '2025-12-01' from generate_series(1, 4) g;
create table articles_rels (id serial primary key, parent_id int references articles(id), tag int);
insert into articles_rels (parent_id, tag) values (3, 7);
create table listicle_itineraries (id serial primary key, access varchar not null default 'free', updated_at timestamptz not null);
insert into listicle_itineraries (updated_at) values ('2025-12-01');
SQL
)

# The Mac after the split: a new migration and column, bookmarks, its own
# local sign-in, a failed local email that reuses the laptop's id 1.
mac_sql=$(cat <<'SQL'
insert into payload_migrations (name, created_at) values ('m2', '2026-02-01');
alter table articles add column byline boolean default false;
update articles set title = 'a2 edited on the Mac', updated_at = '2026-02-01' where id = 2;
update articles set author_id = 2, updated_at = '2026-02-01' where id = 4;
insert into visitor_auth_users values ('v1', 'reader1@example.test');
insert into identity_email_owners values ('reader1@example.test', 'visitor', 'v1');
insert into visitor_auth_accounts values ('mac-only-google', 'v1');
insert into visitor_profiles (auth_user_id) values ('v1');
insert into email_logs (status) values ('failed');
create table bookmarks (id serial primary key, auth_user_id varchar not null);
insert into bookmarks (auth_user_id) values ('v1'), ('v-not-on-laptop');
insert into payload_locked_documents default values;
insert into payload_locked_documents_rels (parent_id) values (1);
SQL
)

# The laptop after the split: the real readers and payments, and two paywall edits.
laptop_sql=$(cat <<'SQL'
insert into visitor_auth_users values ('v1', 'reader1@example.test'), ('v2', 'reader2@example.test');
insert into identity_email_owners values ('reader1@example.test', 'visitor', 'v1'), ('reader2@example.test', 'visitor', 'v2');
insert into visitor_auth_accounts values ('acc-v1', 'v1'), ('acc-v2', 'v2');
insert into visitor_auth_sessions values ('sess-v2', 'v2');
insert into visitor_profiles (auth_user_id, subscription_status, stripe_customer_id)
  values ('v1', 'active', 'cus_1'), ('v2', 'active', 'cus_2');
select setval('visitor_profiles_id_seq', 50);
insert into stripe_webhook_events (event_id) values ('evt_1'), ('evt_2');
insert into email_logs (status) values ('sent'), ('sent');
update service_accounts set api_key = 'hash-b';
update articles set access = 'member', updated_at = '2026-01-15' where id in (3, 4);
update listicle_itineraries set access = 'member', updated_at = '2026-01-15';
SQL
)

make_dumps() { # make_dumps <extra laptop sql> <extra mac sql>
  for side in mac laptop; do
    q postgres "drop database if exists merge_test_$side" >/dev/null 2>&1
    q postgres "create database merge_test_$side" >/dev/null
  done
  printf '%s\n%s\n%s\n' "$common_sql" "$mac_sql" "$2" | run_sql merge_test_mac
  printf '%s\n%s\n%s\n' "$common_sql" "$laptop_sql" "$1" | run_sql merge_test_laptop
  for side in mac laptop; do
    "$PG_DUMP" -Fc "$SCRATCH/merge_test_$side" > "$TEST_ROOT/$side.dump"
    q postgres "drop database merge_test_$side" >/dev/null
  done
}
merge() { bash "$MERGE" --mac "$TEST_ROOT/mac.dump" --laptop "$TEST_ROOT/laptop.dump" \
  --scratch "$SCRATCH" --out "$TEST_ROOT/merged.sql" "$@" > "$OUTPUT" 2>&1; }
merge_refuses() { # merge_refuses <expected message> [args]
  local expected=$1; shift
  if merge "$@"; then fail "merged although: $expected"; fi
  grep -qF -- "$expected" "$OUTPUT" || fail "wrong failure (wanted: $expected)"
}

# 2a. The happy path, and what the merged database holds.
make_dumps '' ''
merge || fail "the synthetic merge failed"
q postgres 'drop database if exists merge_test_result' >/dev/null 2>&1
q postgres 'create database merge_test_result' >/dev/null
"$PSQL" "$SCRATCH/merge_test_result" -qX -v ON_ERROR_STOP=1 -f "$TEST_ROOT/merged.sql" >/dev/null
expect() { # expect <what> <sql> <value>
  local got; got=$(q merge_test_result "$2")
  [[ $got == "$3" ]] || fail "$1: got '$got', expected '$3'"
}
expect 'readers are the laptop''s' 'select string_agg(id, $$,$$ order by id) from visitor_auth_users' 'v1,v2'
expect 'the Mac-only sign-in link is gone' 'select string_agg(id, $$,$$ order by id) from visitor_auth_accounts' 'acc-v1,acc-v2'
expect 'memberships are the laptop''s' 'select string_agg(stripe_customer_id || $$:$$ || subscription_status, $$,$$ order by id) from visitor_profiles' 'cus_1:active,cus_2:active'
expect 'profile ids carry on from the laptop' 'select nextval($$visitor_profiles_id_seq$$)' '51'
expect 'webhook events are the laptop''s' 'select count(*) from stripe_webhook_events' '2'
expect 'email logs are the laptop''s, not the Mac''s colliding id' 'select string_agg(status, $$,$$ order by id) from email_logs' 'sent,sent'
expect 'service accounts are the laptop''s' 'select api_key from service_accounts' 'hash-b'
expect 'identity owners: Mac staff + laptop readers' 'select string_agg(owner_kind || $$:$$ || owner_id, $$,$$ order by owner_id) from identity_email_owners' 'staff:1,visitor:v1,visitor:v2'
expect 'content edits are the Mac''s' 'select title from articles where id = 2' 'a2 edited on the Mac'
expect 'the paywall edit is the laptop''s' 'select string_agg(id || access, $$,$$ order by id) from articles' '1free,2free,3member,4member'
expect 'both-side edit keeps the Mac''s other columns' 'select author_id from articles where id = 4' '2'
expect 'itinerary paywall is the laptop''s' 'select access from listicle_itineraries' 'member'
expect 'the schema is the Mac''s' 'select string_agg(name, $$,$$ order by id) from payload_migrations' 'm1,m2'
expect 'bookmarks of unknown readers are dropped' 'select string_agg(auth_user_id, $$,$$) from bookmarks' 'v1'
expect 'editing locks are cleared' 'select count(*) from payload_locked_documents' '0'
grep -qF 'articles id 4: laptop differs in author_id' "$OUTPUT" || fail "the both-sides edit was not reported"
grep -qF 'bookmarks: 1 dropped' "$OUTPUT" || fail "the dropped bookmark was not reported"
[[ $(stat -f %Lp "$TEST_ROOT/merged.sql" 2>/dev/null || stat -c %a "$TEST_ROOT/merged.sql") == 600 ]] || fail "merged dump is not mode 600"
q postgres 'drop database merge_test_result' >/dev/null
echo "merge-databases test: merge ok"

# 2b. The laptop edited content after the split, and the Mac is older: refused.
make_dumps "update articles set title = 'laptop edit', updated_at = '2026-01-20' where id = 1;" ''
merge_refuses 'the laptop edited content after the split that the merge would drop: articles 1 (title)'
merge --accept-lost-laptop-edits || fail "--accept-lost-laptop-edits did not merge"
grep -qF 'laptop edits dropped on purpose: articles 1 (title)' "$OUTPUT" || fail "the accepted loss was not reported"

# 2c. A laptop edit to a document's children (rels) counts as an edit.
make_dumps "update articles_rels set tag = 8; update articles set updated_at = '2026-01-16' where id = 3;" ''
merge_refuses 'articles 3 (articles_rels)'

# 2d. Content created only on the laptop after the split: refused.
make_dumps "insert into articles (title, updated_at) values ('new on laptop', '2026-01-20');" ''
merge_refuses 'articles 5 (row exists only on the laptop)'

# 2e. A table only the laptop has: refused.
make_dumps 'create table laptop_only_thing (id int);' ''
merge_refuses 'table laptop_only_thing exists only on the laptop'

# 2f. The laptop ran a migration the Mac never did: refused.
make_dumps "insert into payload_migrations (name, created_at) values ('m-laptop', '2026-01-10');" ''
merge_refuses 'the laptop has migrations the Mac does not'

# 2g. A Mac row pointing at a laptop-sourced row that is not there: the FK check.
make_dumps '' "insert into service_accounts (api_key) values ('mac-only');
  create table payload_preferences_rels (id serial primary key, service_accounts_id int references service_accounts(id));
  insert into payload_preferences_rels (service_accounts_id) values (2);"
merge_refuses 'rows in payload_preferences_rels point at nothing'

# 2h. The scratch server must be a throwaway.
q postgres 'create database someone_elses_data' >/dev/null
merge_refuses 'holds other databases (someone_elses_data)'
q postgres 'drop database someone_elses_data' >/dev/null

echo "merge-databases test: all checks ok"
