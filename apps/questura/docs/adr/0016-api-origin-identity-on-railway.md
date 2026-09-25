# Who the API believes a caller is, on Railway

*2026-09-23. Written for launch-harness PR 2
(`docs/launch-test-harness-handoff-2026-09-23.html`, "Start here", second P0).*

*2026-09-25. **Decided: option A.** The owner picked it
(`docs/pre-launch-plan-2026-09-24.html`, "Decided for you"). The in-app half
is built (launch fix plan item 10); see "Option A as built" at the end. The
Cloudflare Transform Rule and the Railway edge rule are provisioning steps
(`docs/capacity/h01-provisioning-checklist.md`, step 8), and two platform-only
questions are PL1 checks.*

Every limiter in the server counts callers by address: sign-in, sign-up,
password reset, payments, bookmarks, the private and public read limits. The
address comes from the one header `TRUSTED_PROXY` names (`trusted-proxy.ts`).
That header is honest only if two things hold:

1. the proxy in front **overwrites** it, discarding whatever the caller sent;
2. the proxy is the **only way in**.

The laptop gets (2) for free: the origin listens on localhost and only
`cloudflared` can reach it. Railway does not. Every Railway service with a
public domain is reachable at Railway's edge by anyone.

## Facts this rests on

- **Railway names `X-Real-IP` as the client address.** Official, in
  *Public networking → Specs & limits* ("`X-Real-IP` for identifying
  client's remote IP"), checked 2026-09-23. cap07 §1a item 3 says this was
  only on forums; that was out of date.
- **Railway's docs do not say it overwrites a caller-sent `X-Real-IP`.**
  Fact (1) above is unproven for Railway. It needs a live probe.
- **Cloudflare in front of Railway makes `X-Real-IP` Cloudflare's address.**
  Railway sees the Cloudflare edge as the client, so `TRUSTED_PROXY` would
  have to be `cloudflare`.
- **Hiding `*.up.railway.app` does not lock the origin.** A custom domain on
  Railway (`api.questurian.com`) is served by Railway's edge, which routes by
  SNI/Host. Anyone can connect to that edge, name `api.questurian.com`, and
  skip Cloudflare entirely, forged `CF-Connecting-IP` included. Deleting the
  generated domain helps, but it is not a lock.
- **Railway edge rules can block at the edge** (*Networking → Edge rules*):
  match on header, host, path or IPv4 client, then block/allow. Two details
  matter here:
  - "A negative comparison against a missing value doesn't match." A rule
    saying *header is not SECRET → block* lets through every request that
    has **no** header. The lock has to be *allow if header is SECRET*, then
    *block everything*.
  - Client-IP rules match IPv4 only. Allow-listing Cloudflare's ranges would
    leave IPv6 sources out, so a secret header is the safer key.
  - Edge rules need a plan with an edge-rule allowance.

## What PR 2 already fixed, whichever option is chosen

These made the origin question worse than it had to be. They are fixed and
tested now:

- **Better Auth skipped its limiter** for any request whose proxy header was
  missing or not an IP. This only happened in production, so tests never saw
  it. The visitor-auth route now writes Better Auth an identity header on
  every request (`client-identity.ts`). A caller who bypasses the proxy
  shares one bucket instead of being unlimited.
- **IPv6 is counted per /64**, one address has one spelling, and junk in the
  header counts as "no address" (`client-address.ts`). Before this, one IPv6
  /64 or a stream of junk values meant a fresh bucket on every request, even
  through Cloudflare.

What no code can fix: at a reachable origin, a caller who writes a **valid,
different** address each time gets a fresh bucket each time.
`forged-client-ip.test.ts` states this as a test so nobody reads the suite as
proving more than it does. Only the options below close it.

## Options

### A. Cloudflare in front of the API, origin locked by a shared secret *(recommended)*

- `api.questurian.com` is proxied through Cloudflare (orange cloud), in the
  same zone as the client. `TRUSTED_PROXY=cloudflare`, as on the laptop.
- A Cloudflare Transform Rule adds `X-Questura-Origin-Auth: <secret>` to
  every request it forwards to the API.
- A Railway edge rule allows requests carrying that exact header and blocks
  everything else (allow first, then block `Path matches *`, in that order).
- **Defence in depth, in the app:** with `ORIGIN_AUTH_SECRET` set, a request
  without the matching header is treated as unidentified (shared bucket),
  or refused. The app then does not depend on a dashboard rule staying put,
  and the rule can be tested locally like everything else. *Built: see
  "Option A as built".*
- Delete the generated `*.up.railway.app` domain. It is not the lock, but
  it is one less door.

Why recommended: it is the posture already verified on the laptop, the
header is known to be overwritten (Cloudflare documents it), Cloudflare's
WAF and rate limiting sit in front of the API as well as the site, and the
lock is a secret we can rotate and test for, rather than something we assume
about the network.

Cost: one secret to rotate in two places (Cloudflare and Railway/app), and an
edge-rule allowance on the Railway plan (or the in-app check alone).

### B. Railway only, `TRUSTED_PROXY=railway` reading `X-Real-IP`

- No Cloudflare on the API host. Add `railway: 'x-real-ip'` to
  `trusted-proxy.ts`, but **only after** a live probe shows Railway
  overwrites a caller-sent `X-Real-IP`. Probe: send `X-Real-IP: 192.0.2.1`
  to a throwaway Railway service that echoes the header, and check the echo
  is your real address. Repeat with Railway's CDN on, since forum reports say
  it then becomes the CDN edge.
- Keep Railway's CDN **off** for the API (the private responses are already
  `no-store`, so it would only add risk).

Why not first choice: fact (1) is unproven, and the CDN caveat is still only
on forums. The site and the API would also sit behind two different edges.

### C. Cloudflare in front, no lock

Not acceptable. This is the 2026-08-15 `X-Forwarded-For` bypass under a new
header name: any caller at Railway's edge picks their own bucket.

## How each option is proven

- Locally, now: `forged-client-ip.test.ts` (every `TRUSTED_PROXY` value),
  `client-identity.production.test.ts` (Better Auth in production mode),
  `visitor-auth-route.test.ts` (the identity header is always written).
- Launch day, C2 in the handoff: hit the Railway edge directly with the
  custom host and a forged `CF-Connecting-IP`. Under A it must be blocked (or
  counted as unidentified). Under B, forged `X-Real-IP` values must not
  rotate the bucket. Run sign-in past its limit and expect 429 both times.

## Option A as built (launch fix plan item 10, 2026-09-25)

- **Where.** `src/proxy.ts` runs `shared/http/origin-auth.ts` on every request
  the proxy matcher covers (everything except `_next` and static files).
  `ORIGIN_AUTH_SECRET` is compared in constant time (both sides hashed, then
  `timingSafeEqual`). The header is removed from the request before any
  route, logger or error reporter sees it, and the redaction pass removes it
  by name, by shape and by value as a second lock.
- **Two modes.** `ORIGIN_AUTH_MODE=refuse` (default): 403, `no-store`, a
  request id, `{"error":"Forbidden"}` and nothing else. `unidentified`: served,
  with every address header removed first, so every limiter counts it in the
  one shared bucket.
- **One exemption: `/api/health` and `/api/health/ready`, exact paths.**
  Railway's healthcheck (`infra/railway/railway.json`) calls
  `/api/health/ready` on the container from inside Railway, with no header.
  Dot segments are normalised before the check, so `/api/health/../me` is
  locked.
- **Nothing else is exempt, deliberately.** Everything that reaches the API
  from outside passes Cloudflare and so carries the header: browsers, Stripe's
  webhook deliveries (`/api/payments/webhooks/stripe`, still signature-checked
  as before), Google's sign-in redirect (`/api/visitor-auth/callback/google`),
  the writer pipeline, Location Manager and the admin panel. An in-app
  exemption for any of them would be a path the Railway edge rule blocks
  anyway. Schedulers (ADR-0015) must call the public host, not Railway's
  private network, or send the header themselves.
- **The site's own renders** send the header themselves, from the Worker
  secret `ORIGIN_AUTH_SECRET` (`renderHeaders()` in the client), so it does
  not matter whether the Transform Rule applies to Worker subrequests.
- **Configuration.** Boot refuses a secret under 32 characters, an unknown
  mode, or a mode without a secret. Boot allows it unset, because the laptop's
  origin is reachable only through its tunnel. `env:check` refuses a Railway
  variable file without it, or with the render token's value.
- **Proof.** Unit: `proxy.test.ts`, `origin-auth.test.ts`, redaction, logger
  and Sentry scrub tests, the client's `originAuth.test.mjs`. Readiness: the
  stack runs a Cloudflare stand-in on the API port and the locked backend on
  4110, so every other suite goes through the door; `readiness:front-door`
  proves the lock at 4110 and that every page in the launch route list renders
  with the stand-in adding nothing to the site's renders. Launch day:
  `launch:verify --edge-ip <Railway edge IP>` (or `--origin-edge <origin>`,
  the same probe) must see 403. Since launch fix plan item 6 the probe is
  required against the real site, `--bypass` too, and a DNS, TLS or
  connection error on either is "unknown" and fails rather than counting as
  locked; the edge probe ignores the certificate, as a caller skipping
  Cloudflare would.
- **Still platform-only (PL1).** Whether the Transform Rule reaches Worker
  subrequests, and which client address those subrequests present to the API
  (the render token gives public reads their own bucket either way, but other
  limiters count by address). Both are read from the API log on the day.
