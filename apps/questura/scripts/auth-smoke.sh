#!/usr/bin/env bash
# Signed-in visitor auth smoke test, against a LOCAL server only.
#
#   apps/questura/scripts/auth-smoke.sh [--server http://localhost:4000] [--origin http://localhost:3000]
#
# Signs up a throwaway user (qa-smoke-…@example.com), signs in a second
# session, then checks /api/me, /api/account/auth-methods, sessions in Postgres,
# a local Redis flush, password change revoking the other session on a payment
# route, the change-password rate limit, and sign-out.
#
# It refuses to run unless the server it talks to is using:
#   - REDIS_URL on 127.0.0.1:6380 (the local-only Redis, infra/local/compose.yml)
#   - DATABASE_URI on 127.0.0.1:5432 (the scratch database)
#   - an empty RESEND_API_KEY (sign-up mails a verification link otherwise)
#   - no live Stripe key
# Values are read the way Next resolves them for the process listening on the
# server port: its own environment first (an empty value counts), then
# .env.development.local, .env.local, .env.development, .env in its directory.
#
# It flushes the local Redis container (questura-local-redis) and nothing else.
# Port 6379 on the Linux laptop is the LIVE questura-redis: never touched here.
# Nothing here calls Stripe: the payment route it uses (subscription-details)
# answers 401/404 before any Stripe call for a user with no subscription.
#
# Docs: apps/questura/docs/local-vs-live.md ("Auth smoke test").
set -uo pipefail

SERVER=http://localhost:4000
ORIGIN=http://localhost:3000
LOCAL_REDIS_CONTAINER=questura-local-redis

while [[ $# -gt 0 ]]; do
  case $1 in
    --server) SERVER=$2; shift 2 ;;
    --origin) ORIGIN=$2; shift 2 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "auth-smoke: unknown argument $1" >&2; exit 2 ;;
  esac
done

refuse() { echo "auth-smoke: REFUSING: $*" >&2; exit 1; }

for tool in curl jq psql docker; do
  command -v "$tool" >/dev/null || refuse "$tool is not installed"
done

[[ $SERVER =~ ^http://(localhost|127\.0\.0\.1):([0-9]+)$ ]] || refuse "--server must be http://localhost:<port>, got $SERVER"
PORT=${BASH_REMATCH[2]}

# ---------------------------------------------------------------------------
# Resolve the server's effective environment.
# ---------------------------------------------------------------------------
if command -v ss >/dev/null; then
  PID=$(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
else
  PID=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1)
fi
[[ -n $PID ]] || refuse "nothing is listening on port $PORT"

if [[ -r /proc/$PID/environ ]]; then
  PROC_ENV=$(tr '\0' '\n' < "/proc/$PID/environ")
  SERVER_DIR=$(readlink "/proc/$PID/cwd")
else
  # macOS: `ps eww` appends the environment to the command line.
  PROC_ENV=$(ps eww -o command= -p "$PID" | tr ' ' '\n')
  SERVER_DIR=$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
fi
[[ -n $SERVER_DIR && -d $SERVER_DIR ]] || refuse "could not find the working directory of pid $PID"

# Prints the value and returns 0 when KEY is defined (even as empty).
server_env() {
  local key=$1 line file
  line=$(grep -m1 -E "^${key}=" <<<"$PROC_ENV") && { printf '%s' "${line#*=}"; return 0; }
  for file in .env.development.local .env.local .env.development .env; do
    [[ -f $SERVER_DIR/$file ]] || continue
    line=$(grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$SERVER_DIR/$file") || continue
    line=${line#*=}
    line=${line%%[[:space:]]#*}
    line=${line%"${line##*[![:space:]]}"}
    line=${line#\"}; line=${line%\"}; line=${line#\'}; line=${line%\'}
    printf '%s' "$line"
    return 0
  done
  return 1
}

REDIS_URL=$(server_env REDIS_URL) || REDIS_URL=
DATABASE_URI=$(server_env DATABASE_URI) || DATABASE_URI=
RESEND_API_KEY=$(server_env RESEND_API_KEY) || RESEND_API_KEY=
STRIPE_SECRET_KEY=$(server_env STRIPE_SECRET_KEY) || STRIPE_SECRET_KEY=

[[ $REDIS_URL =~ ^redis://([^@/]*@)?(127\.0\.0\.1|localhost):6380(/.*)?$ ]] \
  || refuse "server REDIS_URL must be redis://127.0.0.1:6380 (the local Redis), got '${REDIS_URL:-<unset>}'"
[[ $DATABASE_URI =~ ^postgres(ql)?://([^@/]*@)?(127\.0\.0\.1|localhost):5432/ ]] \
  || refuse "server DATABASE_URI must be the scratch database on 127.0.0.1:5432"
[[ -z $RESEND_API_KEY ]] \
  || refuse "server RESEND_API_KEY is set, so sign-up would send a real email. Restart the server with RESEND_API_KEY= (see docs/local-vs-live.md)"
[[ $STRIPE_SECRET_KEY != sk_live_* && $STRIPE_SECRET_KEY != rk_live_* ]] \
  || refuse "server has a live Stripe key"

[[ $(docker port "$LOCAL_REDIS_CONTAINER" 6379/tcp 2>/dev/null) == "127.0.0.1:6380" ]] \
  || refuse "container $LOCAL_REDIS_CONTAINER is not published on 127.0.0.1:6380 (docker compose -f infra/local/compose.yml up -d)"

env_name=$(curl -fsS "$SERVER/api/health" | jq -r .environment) || refuse "$SERVER/api/health did not answer"
[[ $env_name == development ]] || refuse "server reports environment '$env_name', expected development"

echo "auth-smoke: server pid $PID in $SERVER_DIR"
echo "auth-smoke: redis 127.0.0.1:6380 ($LOCAL_REDIS_CONTAINER), db 127.0.0.1:5432, email off"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# A TEST-NET-3 address per run: Better Auth keys its limits on it in dev, so a
# rerun inside the minute does not inherit the last run's counters.
FAKE_IP="203.0.113.$((RANDOM % 250 + 1))"
STAMP=$(date +%s)
EMAIL="qa-smoke-${STAMP}-${RANDOM}@example.com"
PASS1="Smoke-${RANDOM}-Aa1!"
PASS2="Smoke-${RANDOM}-Bb2!"

failures=0
pass() { printf '  PASS  %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$*"; failures=$((failures + 1)); }
info() { printf '  INFO  %s\n' "$*"; }
step() { printf '\n%s\n' "$*"; }

# req JAR METHOD PATH [JSON] -> sets STATUS and BODY
req() {
  local jar=$1 method=$2 path=$3 data=${4:-}
  local args=(-sS -o "$WORK/body" -w '%{http_code}' -X "$method"
    -b "$jar" -c "$jar"
    -H "Origin: $ORIGIN" -H "X-Forwarded-For: $FAKE_IP")
  [[ -n $data ]] && args+=(-H 'Content-Type: application/json' --data "$data")
  STATUS=$(curl "${args[@]}" "$SERVER$path") || STATUS=000
  BODY=$(cat "$WORK/body" 2>/dev/null)
}

cookie() { awk -F'\t' -v n="$2" 'NF >= 7 && $6 == n { v = $7 } END { print v }' "$1"; }

sql() { psql "$DATABASE_URI" -XAtqc "$1"; }

redis() { docker exec "$LOCAL_REDIS_CONTAINER" redis-cli "$@"; }

A=$WORK/a.jar; B=$WORK/b.jar
: > "$A"; : > "$B"

# ---------------------------------------------------------------------------
step "1. Sign up (session A) and sign in (session B) as $EMAIL"
# ---------------------------------------------------------------------------
req "$A" POST /api/visitor-auth/sign-up/email \
  "$(jq -nc --arg e "$EMAIL" --arg p "$PASS1" '{email: $e, password: $p, name: "QA Smoke"}')"
[[ $STATUS == 200 ]] && pass "sign-up 200" || { fail "sign-up $STATUS: $BODY"; exit 1; }
USER_ID=$(jq -r '.user.id // empty' <<<"$BODY")

req "$B" POST /api/visitor-auth/sign-in/email \
  "$(jq -nc --arg e "$EMAIL" --arg p "$PASS1" '{email: $e, password: $p}')"
[[ $STATUS == 200 ]] && pass "sign-in 200" || { fail "sign-in $STATUS: $BODY"; exit 1; }

for jar in A B; do
  j=${!jar}
  if [[ -n $(cookie "$j" questura_visitor.session_token) && -n $(cookie "$j" questura_visitor.session_data) ]]; then
    pass "session $jar has session_token and session_data cookies"
  else
    fail "session $jar is missing a cookie"
  fi
done
TOKEN_A=$(cookie "$A" questura_visitor.session_token)
TOKEN_B=$(cookie "$B" questura_visitor.session_token)

# ---------------------------------------------------------------------------
step "2. /api/me and /api/account/auth-methods"
# ---------------------------------------------------------------------------
for jar in A B; do
  req "${!jar}" GET /api/me
  if [[ $STATUS == 200 && $(jq -r '.authenticated' <<<"$BODY") == true && $(jq -r '.principal.email' <<<"$BODY") == "$EMAIL" ]]; then
    pass "/api/me session $jar: authenticated as the test user"
  else
    fail "/api/me session $jar: $STATUS $BODY"
  fi
done
removed=$(jq -r '[paths | .[-1] | strings | select(. == "hasLocalPassword" or . == "hasGoogleOAuth" or . == "authProvider")] | length' <<<"$BODY")
[[ $removed == 0 ]] && pass "/api/me carries no sign-in method fields" || fail "/api/me still carries sign-in method fields: $BODY"

req "$A" GET /api/account/auth-methods
if [[ $STATUS == 200 && $(jq -c '[.hasLocalPassword, .hasGoogleOAuth]' <<<"$BODY") == '[true,false]' ]]; then
  pass "/api/account/auth-methods: password only ($(jq -c . <<<"$BODY"))"
else
  fail "/api/account/auth-methods: $STATUS $BODY"
fi

# ---------------------------------------------------------------------------
step "3. Sessions are in Postgres; flush the local Redis; still signed in"
# ---------------------------------------------------------------------------
rows=$(sql "select count(*) from visitor_auth_sessions where \"userId\" = '${USER_ID//\'/}'")
[[ $rows == 2 ]] && pass "visitor_auth_sessions has 2 rows for the user" || fail "visitor_auth_sessions rows: '$rows' (expected 2)"

keys_before=$(redis DBSIZE)
[[ ${keys_before:-0} -gt 0 ]] && pass "local Redis holds $keys_before keys before the flush" || fail "local Redis is empty before the flush: is the server using it?"
redis FLUSHALL >/dev/null
keys_after=$(redis DBSIZE)
[[ $keys_after == 0 ]] && pass "local Redis flushed ($LOCAL_REDIS_CONTAINER only)" || fail "local Redis not empty after flush: $keys_after"

for jar in A B; do
  # disableCookieCache: skip the 5-minute session_data cookie so this is
  # answered from the session store (Redis miss -> Postgres), not the cookie.
  req "${!jar}" GET '/api/visitor-auth/get-session?disableCookieCache=true'
  [[ $STATUS == 200 && $(jq -r '.user.email // empty' <<<"$BODY") == "$EMAIL" ]] \
    && pass "session $jar valid after flush (store lookup, cookie cache bypassed)" \
    || fail "session $jar after flush: $STATUS $BODY"
done
req "$B" GET /api/payments/subscription-details
[[ $STATUS == 404 ]] && pass "payment route (freshSession) for session B after flush: 404 no subscription, i.e. signed in" \
  || fail "payment route for session B after flush: $STATUS $BODY (expected 404)"

# ---------------------------------------------------------------------------
step "4. Password change on A revokes B at once on the payment route"
# ---------------------------------------------------------------------------
req "$A" POST /api/visitor-auth/change-password \
  "$(jq -nc --arg c "$PASS1" --arg n "$PASS2" '{currentPassword: $c, newPassword: $n, revokeOtherSessions: true}')"
[[ $STATUS == 200 ]] && pass "change-password 200 (change 1 of the 5-a-minute budget)" || fail "change-password $STATUS: $BODY"

req "$B" GET /api/payments/subscription-details
[[ $STATUS == 401 ]] && pass "session B on the payment route: 401 immediately" || fail "session B on the payment route: $STATUS $BODY (expected 401)"

# Before the store check below: a refused get-session clears B's cookies.
req "$B" GET /api/me
info "session B /api/me authenticated=$(jq -r .authenticated <<<"$BODY") (true is by design: the 5-minute cookie cache, #650)"

req "$B" GET '/api/visitor-auth/get-session?disableCookieCache=true'
[[ $(jq -r '.user.email // empty' <<<"$BODY") == "" ]] && pass "session B gone from the store" || fail "session B still in the store: $BODY"

req "$A" GET /api/payments/subscription-details
[[ $STATUS == 404 ]] && pass "session A (the one that changed it) still signed in on the payment route" || fail "session A on the payment route: $STATUS $BODY"

old_b=$(sql "select count(*) from visitor_auth_sessions where token = '${TOKEN_B%%.*}'")
[[ $old_b == 0 ]] && pass "session B's row deleted from Postgres" || fail "session B's row still in Postgres ($old_b)"

# ---------------------------------------------------------------------------
step "5. change-password rate limit (5 a minute, then 429)"
# ---------------------------------------------------------------------------
first_429=0
for attempt in 2 3 4 5 6 7; do
  req "$A" POST /api/visitor-auth/change-password \
    "$(jq -nc --arg n "$PASS1" '{currentPassword: "Wrong-Password-9!", newPassword: $n}')"
  if [[ $STATUS == 429 ]]; then first_429=$attempt; break; fi
done
if [[ $first_429 == 6 ]]; then
  pass "requests 1-5 answered, request 6 got 429"
elif [[ $first_429 == 0 ]]; then
  fail "no 429 after 7 change-password requests (last: $STATUS $BODY)"
else
  fail "first 429 on request $first_429 (expected 6)"
fi

# ---------------------------------------------------------------------------
step "6. Sign out"
# ---------------------------------------------------------------------------
TOKEN_A=$(cookie "$A" questura_visitor.session_token)
req "$A" POST /api/visitor-auth/sign-out '{}'
[[ $STATUS == 200 ]] && pass "sign-out 200" || fail "sign-out $STATUS: $BODY"

req "$A" GET /api/me
[[ $(jq -r .authenticated <<<"$BODY") == false ]] && pass "/api/me after sign-out: anonymous" || fail "/api/me after sign-out: $BODY"

replay=$(curl -sS -H "Origin: $ORIGIN" -H "Cookie: questura_visitor.session_token=$TOKEN_A" \
  "$SERVER/api/visitor-auth/get-session?disableCookieCache=true")
[[ $(jq -r '.user.email // empty' <<<"$replay" 2>/dev/null) == "" ]] && pass "old session A token no longer works" || fail "old session A token still works: $replay"

rows=$(sql "select count(*) from visitor_auth_sessions where \"userId\" = '${USER_ID//\'/}'")
[[ $rows == 0 ]] && pass "no session rows left for the user" || fail "$rows session rows left for the user"

# ---------------------------------------------------------------------------
step "7. No email left the machine"
# ---------------------------------------------------------------------------
sent=$(sql "select count(*) from email_logs where recipient = '$EMAIL' and status = 'sent'")
logged=$(sql "select coalesce(string_agg(email_type || ':' || status, ', '), 'none') from email_logs where recipient = '$EMAIL'")
[[ $sent == 0 ]] && pass "email_logs: nothing sent to the test address (logged: $logged)" || fail "email_logs shows $sent sent to $EMAIL"

echo
if [[ $failures -eq 0 ]]; then
  echo "auth-smoke: all checks passed ($EMAIL)"
else
  echo "auth-smoke: $failures check(s) FAILED ($EMAIL)"
  exit 1
fi
