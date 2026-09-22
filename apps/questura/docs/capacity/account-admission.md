# Account routes: admission, fairness and failure policy

Surge plan L03 (2026-09-22), closing discovery finding 2. Every costly
account path is listed by method. "Costly" means it resolves a session, hashes
a password or reads the database on behalf of one visitor.

## The order, once

Every row marked **private order** runs through
`features/visitor-auth/lib/private-route.ts`:

1. Origin check and the **no-session-cookie shortcut** (the route, free). The
   cookie is found **by name** (`questura_visitor.session_token`, or its
   `__Secure-` form) — not by any cookie text that mentions the prefix.
2. **Ingress** gate — before anything that can wait on Redis.
3. **Pre-auth limits**: per-session-token and per-address guard
   (`session-traffic-limit.ts`, fails open), then any route-specific limit.
4. **`private`** gate (or **`auth`** for password work), held until the
   handler finishes — including Better Auth's internal `getSession`, which its
   HTTP rate limiter never sees.
5. Per-account limits after identity (bookmark writes), inside the handler.

Each gate is taken once, in this order. No route nests a gate inside itself.
Every answer — success, limit, refusal or dependency exception — carries the
route's private CORS headers and `no-store`. A dependency exception is **503 +
`Retry-After: 2` + `X-Questura-Unavailable: dependency`**, never "signed out".

## Coverage

| Route | Method | No cookie | Pre-auth limit | Gate | Pools | Timeout | Cache | Dependency failure |
|---|---|---|---|---|---|---|---|---|
| `/api/me` | GET | anonymous, **0 SQL / 0 Redis** | session+IP, fail open | private | visitor-auth (session, accounts), payload (profile) | pool 10 s, statement 15 s | no-store | 503 |
| `/api/account/bookmarks/refs` | GET | `{authenticated:false}`, 0 work | session+IP, fail open | private | visitor-auth, payload | same | no-store | 503 (a failed list is not an empty list) |
| `/api/account/bookmarks` | GET | 401, 0 work | session+IP, fail open | private | visitor-auth, payload | same | no-store | 503 |
| `/api/account/bookmarks` | POST | 401, 0 work | session+IP, fail open | private | visitor-auth, payload (write) | same | no-store | 503; write limit outage → 503 `counter-unavailable` |
| `/api/account/bookmarks` | DELETE | 401, 0 work | session+IP, fail open | private | same | same | no-store | same as POST |
| `/api/public/articles/full` | GET | 401, **no Redis** | session+IP (open), then **30/min per address, fail closed** | private | visitor-auth, payload depth 2 | same | no-store | 503; limiter outage → 503 `counter-unavailable` (was 429) |
| `/api/visitor-auth/*` | all | Better Auth's own answer | Better Auth rate limits (per address+path) | **auth** | visitor-auth, CPU (scrypt) | same | Better Auth's | 500 from Better Auth; gate refusal 503 no-store |
| `/api/account/set-password` | POST | Better Auth refuses | 5/min per address (existing, fail closed) | **auth** | visitor-auth, CPU | same | cors | 503 |
| `/api/payments/*` | all | — | payment limits (existing, fail closed) | **none, deliberately** | payload, advisory lock, Stripe | lock wait 30 s | no-store | unchanged |

Payments are left out of every gate on purpose (`shared/http/admission.ts`):
a refused checkout or webhook is a money bug, and their volume is bounded by
Stripe and their own fail-closed limits. Editorial writes likewise.

## Failure policy by class

| Class | Counter outage | Why |
|---|---|---|
| Public reads (`publicRead`) | fail open | bounded by ingress + query/assembly gates regardless |
| Session-bearing identity/bookmark reads | fail open, logged | bounded by the private gate regardless; refusing all signed-in readers on a counter outage is a self-inflicted logout |
| Member body | **fail closed → 503** | guards the paid body; now says "unavailable", not "too many" |
| Bookmark writes | **fail closed → 503** | the alternative is an unbounded write endpoint |
| Payments | fail closed | unchanged |

## Fairness

- **Per session token**: 120/min (`SESSION_TRAFFIC_PER_SESSION`). The closest
  thing to "one reader" known before authentication. An invented token gets
  its own bucket, but fails Better Auth's HMAC check before any query — so
  rotation buys CPU, not database work.
- **Per address**: 1,200/min (`SESSION_TRAFFIC_PER_IP`) — a coarse guardrail.
  At three private requests per page that is 400 page views a minute from
  everyone behind one NAT together. Quantified in
  `session-traffic-limit.test.ts`. One address is not one person; this stops
  monopolisation, not reading.
- Keys are hashes (`hashIdentifier`); no raw cookie text becomes a key or a
  metric label.

## Demand against the pools (not a reservation)

Per process, defaults: ingress 64, query 8, assembly 2, private 16, auth 4,
credential 8, staff 16. **Gate counts are not reserved connections.** A
private lookup holds a visitor-auth connection for one or two short queries,
not for the whole request, so sixteen admitted lookups do not mean sixteen
connections — but at the worst moment, private (16) + auth (4) can ask more of
Better Auth's ten-connection pool than it has. Those waits are bounded by the
pool's `connectionTimeoutMillis` (10 s), which is a long, quiet wait. The
auth gate was set to 4, not 8, to keep that overlap small. Payload's
twenty-connection pool is shared by public, private, staff and background
work. Pool sizes were not raised to hide queueing; the right numbers come
from measuring on the hosted platform (`pool-budget.ts`).

## Observability

`/api/internal/db-stats` reports every gate (`admission`), including the new
`credential`, `staff` and `auth` gates. Refusals carry
`X-Questura-Overload: <gate>; <reason>`, limits carry `X-Questura-Limit:
session | ip | account`, outages `X-Questura-Unavailable`.

## Not verified here

Real OAuth provider limits and callback timing, real cross-subdomain cookies,
and shared-address behaviour behind the hosted proxy chain. Local stubs prove
the application branches only.
