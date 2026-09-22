# Surge L00–L03 — the sandbox, the launch corpus, and real-route checks

Local, 2026-09-22. Base `20260922` series on `main` after #636–#639 (L02/L04/L07,
L03, L06, L05). Machine: macOS 15.4.1, 8 cores, 16 GB. Node v24.15.0, pnpm
10.0.0, PostgreSQL 14.18, redis-server 8.10.2, k6 v2.3.0. No browser runner
installed; browser captures use the desktop app's built-in browser.

## L00 — isolation that is enforced, not assumed

| Guarantee | How it is enforced | Evidence |
|---|---|---|
| Loopback only | `deny-outbound.cjs` preloaded into every sandbox process wraps `net.Socket.prototype.connect`; non-loopback connections fail with `EREADINESSOUTBOUND` and are logged (host/port only). `*.localhost` is routed to 127.0.0.1 (RFC 6761). | `harness.test.ts` (fetch to example.com refused and logged; loopback and `*.localhost` allowed) |
| Only fonts at build time | `READINESS_OUTBOUND_ALLOW=fonts.googleapis.com,fonts.gstatic.com` for the client *build* only. | `apps.ts` `clientEnv(…, { build: true })` |
| `.env` cannot leak in | `next build`/`next start` load `.env*` and fill unset names. Every name those files define and the harness does not set is set to `''` (`sandbox-env.ts`). | Found on this Mac: server `.env` carried `SENTRY_DSN`, `ENDORSELY_API_KEY`, `BUNNY_STORAGE_*`; client `.env.production.local` carried `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_IMAGE_CDN_ORIGIN`, which a readiness build would have inlined into browser JavaScript. |
| Processes bind loopback | `next start -H 127.0.0.1`; Redis `--bind 127.0.0.1`; fixture servers listen on 127.0.0.1. Preflight no longer accepts `0.0.0.0` (it is "every interface"). | `harness.test.ts` preflight cases |
| Occupied port = refusal | TCP probe (not HTTP) on 3100/3190/3191/4100/6390 before anything starts. | `apps.ts` `assertPortsFree` |
| Redis isolation | A dedicated `redis-server` on 6390, no persistence, owned by the run. **Better Auth's session keys ignore `REDIS_KEY_PREFIX`** (keys are the bare session token and `active-sessions-<user>`), so the prefix was never an isolation boundary; the separate instance is. | `redis-cli -p 6390 --scan` during the run |
| Writes stay in the allowlist | Preflight (unchanged): `questura_readiness`, `_scratch`, `_restore` only. | `preflight.test.ts` |
| Only owned processes stop | `stack.ts` records pids + command markers in a 0700 temp dir; `down` signals only pids whose command still matches. | `pnpm readiness:stack -- down` |
| No Stripe attempt | The pricing page retrieves prices on render. Two `api.stripe.com` attempts were refused by the socket guard on the first build; the SDK is now pointed at a loopback Stripe stub (`stripe-stub.ts`) via a seam that is active only with `READINESS_SANDBOX=1` and a `http://127.0.0.1:<port>` URL (`stripe-sandbox-host.test.ts`). Every non-price call to the stub is refused and counted. | Stub stats after a build: `{"prices":2,"refused":{}}`; outbound log: 0 Stripe |

**Outbound attempts during a full bootstrap → seed → build → start → route checks:**
one, `telemetry.payloadcms.com:443` (Payload's anonymous usage ping; it has no
environment opt-out, only `telemetry: false` in config). Refused and logged.
No email, OAuth, Stripe, Bunny or Maps attempt.

Baseline before any change (for the record): focused suites 86 server + 20
client tests, all passing (discovery had recorded 78 + 20; the difference is
tests added by #635).

## L01 — a reproducible schema, fifty articles, real sessions

`pnpm readiness bootstrap` → `pnpm readiness:launch -- seed`

- **Schema** from `scripts/readiness/fixtures/schema.sql` (333 KB): schema only
  plus the `payload_migrations` ledger, loaded with `ON_ERROR_STOP=1`, then
  `payload migrate` applies anything newer. Provenance: a schema-only dump of
  the local scratch database loaded into `questura_readiness_scratch`, migrated
  to HEAD (one migration applied: `20260922_063804_refresh_jobs_fencing`),
  dumped. **No row left the source.** The scratch source was read, never
  written (its ledger count was 47 before and after). `harness.test.ts` refuses
  a fixture with any `COPY` or non-ledger `INSERT`, and any ledger name the
  repository does not ship (five historical names, whose files were removed
  after they ran, are pinned by name).
- **Corpus** (`load/k6/manifests/launch-v1.json`, the single source of
  expected values): 50 published — 26 standard articles (7 members-only), 12
  maps (never gated: single-type listicles have no access tier by product
  design), 12 itineraries (4 members-only) — plus 4 drafts, 1 retired
  (published, bookmarked, unpublished), 4 curated city pages, 3 authors, 72
  places with galleries, 8 fixture images served from `127.0.0.1:3190`, 50
  search rows. Each piece carries a title marker, a revisioned body marker in
  its public part, and (members-only) a member marker in its closing part.
- **Identities**: member A, member B, a signed-in non-member, an expired
  session; staff admin and a service account for the credential matrix. Real
  scrypt hashes via Better Auth's internal adapter (its sign-up mails a
  link); sessions minted at run time by the real sign-in endpoint; the expired
  one has its session removed from the store, as TTL expiry does. No cookie is
  ever written anywhere.
- **Deterministic**: two clean bootstrap+seed cycles produce the same logical
  manifest fingerprint (`0d98d6fc5dd0087f` before identity ids were dropped
  from the manifest). Seeding over an existing corpus is refused.
- **Order that matters**: after a reseed, rebuild the client
  (`pnpm readiness:stack -- up --build-client`). Its pages are pre-rendered
  from the backend at build time, and the seed's refresh jobs have no client
  to notify.

## L01–L03 — real routes (`pnpm readiness:routes`): 114/114

Evidence: `2026-09-22-surge-routes.json`. Production builds of both apps on
3100/4100, the launch corpus, real sign-ins.

| Group | Checks | What passed |
|---|---|---|
| Identity | 9 | anonymous (0 SQL statements, `no-store`); A, B, non-member by exact email **and** auth user id and entitlement; expired, random signed-looking and malformed tokens all signed out |
| Bookmarks | 9 | A and B each see exactly their own refs; non-member empty but signed in; anonymous and expired signed out; all `no-store` |
| Member body | 16 | member A and B get the body with the member marker; non-member 403, expired 401, anonymous 401, none carrying the marker; a free piece is refused by the member route |
| Public pages | 11 | every members-only piece's public page has its title and body markers and **no** member marker |
| Credentials (L02) | 69 | absent, unrelated cookie, malformed, expired JWT, forged JWT, forged `payload-token`, bogus API key, `x-api-key`, disabled staff → REST clamped to `limit: 100`, disguised POST read 401, GraphQL 401, never in the staff gate; valid staff and service account → own `limit: 1000`, POST read and GraphQL allowed, inside the staff gate; every presented credential verified in the credential gate |

The credential matrix reads the clamp from Payload's own response and the gate
movement from `/api/internal/db-stats` — the real strategies, not the unit
tests' stand-in. The disabled-staff token is a real session for an account
disabled after sign-in; staff accounts must use `@questurian.com`, so that
synthetic account does too (in the disposable database, with mail impossible).

## Limits

Loopback only; not a hosted cookie, CORS or proxy-chain check. The expired
session models TTL expiry of the store, not every way a session can end.
Blocked-handler bounds for the account routes are proved in unit tests
(`private-routes.test.ts`); the load behaviour is L10.
