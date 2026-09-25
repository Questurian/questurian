# Launch day: what to run, in order

Everything here was written and proven before launch, against the readiness
sandbox (a production build on the laptop, no network, no Stripe). On the day
you run it; you do not write it. Steps marked **owner** need your yes.

Platform plan: `docs/capacity/cap07-platform-readiness.md` §1a. Clicks:
`docs/capacity/h01-provisioning-checklist.md`. Origin decision: ADR-0016.
Moving the data and the keys off the laptop, in order, with the owner steps:
`docs/procedures/cutover.md`.

## Sandbox setup

Step 2 runs against the readiness sandbox: production builds of both apps on
this machine, with their own database and Redis, no network and fake
Stripe/Google. From a fresh session it needs only `docker`:

- **Postgres** is the `questura-readiness-pg` container on 127.0.0.1:5442
  (`postgres:16`, data on a tmpfs, role `postgres`, database
  `questura_readiness`). That is the default address, so no export is
  needed. `readiness:stack -- up` starts the container if it is missing,
  stopped or paused, and gives a brand-new database the schema fixture and the
  launch corpus (`readiness bootstrap`, then `readiness:launch -- seed`)
  before it builds. Set `READINESS_DATABASE_URI` only to use a different
  disposable database; `stack up` then leaves it as it is.
- **Redis** is 127.0.0.1:6390, never 6379. With no `redis-server` binary on
  PATH, `stack up` runs it as the `questura-readiness-redis` container
  (`redis:7-alpine`, no persistence), which is also what `readiness:faults`
  pauses. `stack down` removes it.
- **Front door.** The API's port 4100 is a stand-in for Cloudflare
  (`front-door-edge.ts`) that adds the origin secret, as the Transform Rule
  will; the backend itself listens on 4110 with `ORIGIN_AUTH_SECRET` set and
  refuses anything without it (ADR-0016). Every script and the browsers call
  4100 and go through the door. The site's own renders get nothing added, so
  the client has to send the secret itself.
- **Rate limits.** Every step-2 script empties the sandbox Redis (6390 only)
  before it starts, so running them back to back does not spend each other's
  per-address budget. Playwright's global setup does the same.
- On the laptop that serves the live window, 5433 and 6379 are the live
  Postgres and Redis (`questura-postgres`, `questura-redis`). Nothing in the
  sandbox touches them: preflight refuses Redis on 6379 and any database not
  named `questura_readiness*`, and the container helpers refuse any other
  container name or port.
- **Memory.** About 7.5 GB. Check `free -m` first and stop below 2,500 MB
  available. `stack up --build` caps each build at 3 GB of heap. Don't start a
  second build while a stack is up, and run `readiness:stack -- down` when
  finished.

- **Faults at the front door.** `POST http://127.0.0.1:4100/__edge/fault`
  with `{"status": 503, "match": "<text>"}` makes the Cloudflare stand-in
  answer that status itself for every API request whose path and query
  contain the text; `null` clears it. Journey 10 uses it for one article.
  Off unless set; only 5xx statuses are accepted.
- **Images.** Every image address points at the fixture media server,
  `http://media.readiness.localhost:3190` (`READINESS_MEDIA_ORIGIN`, honoured
  only with `READINESS_SANDBOX=1` and only for loopback http; `env:check`
  refuses both names on Railway). Before launch fix plan item 8 they pointed
  at a host that does not exist, and no local test had ever seen an image
  load.

After step 2, the browser journeys run against the same stack:

```bash
pnpm --dir apps/questura/apps/e2e exec playwright test --project='chromium*' --project='firefox*'   # expect 75 passed, 1 skipped (30 tests × 2 engines, journey 12 is Chromium only, + journeys 1–3 on 2 phones × 2 engines)
```

What they cover (launch fix plan item 8):

| Spec | Tests | What |
|---|---|---|
| `browse.spec.ts` | 1 | Journey 1: home → city → article → author → back; every image decodes, nothing wider than the screen |
| `join.spec.ts` | 2 | Journey 2: paywall → plans at $12.99 / $79.99 with the article carried along; sign-up, verification mail, fake Checkout, signed webhook, back on the open article |
| `accounts.spec.ts` | 3 | Journeys 3–5: password sign-up / in / out; Google through the fake provider; password reset (other sessions end, the link works once, an expired link is refused) |
| `settings.spec.ts` | 2 | Journey 6: change password (this browser stays in, the other is signed out, the old password is refused, the notice mail arrives); journey 7: change email through the mailbox (sign-in moves to the new address, the old one is told) |
| `billing.spec.ts` | 3 | Journey 8: a monthly and a yearly member's account page (plan, renewal date, Monthly / Yearly); cancel, then reactivate |
| `find.spec.ts` | 2 | Journey 9: bookmark an article, find it in Bookmarks, remove it; search from the menu, open the result, a query with no match |
| `errors.spec.ts` | 3 | Journey 10: a made-up address and a missing article are real 404s with the site's menu and footer; an article the API cannot serve (503 at the front door) shows the branded error page (HTTP 500), not a blank or bare one |
| `slow.spec.ts` | 1 | Journey 12: journey 1 on Slow 3G + 4× slower CPU (Chromium only), inside 180 s |
| phone projects | 4 per phone and engine | Journey 11: journeys 1–3 on Pixel 7 and iPhone 13 screens (`chromium-*` emulate the phone fully; `firefox-*` get its screen, density, touch and user agent), with no horizontal scroll on any page |
| `account.spec.ts` | 3 | `/account` hydrates without React #418, signed out, as a member and as a non-member (four loads each, at most one error: see below) |
| `membership.spec.ts` | 3 | The paywall, member sign-in and sign-out, a non-member |
| `session.spec.ts` | 2 | Session cookie flags; a wrong password |
| `redirects.spec.ts` | 5 | `?returnTo=` never leaves the site and lands exactly on the safe fallback |

Every page in every spec fails on a console error, an uncaught page error or
a failed request (a network failure or any response of 400 or more), apart
from an explicit allowlist in `tests/fixtures.ts`, each entry with its reason.
One entry is a known React 19.1 hydration race: about one fast page load in
seventy, React throws #418 while a layout hydrates and recovers by rendering
the page again in the browser (the reader still gets the page). It is allowed
once per browser context, so a real mismatch, which fails every load, still
fails. A Suspense boundary under the layouts stops the race but made every
404 answer 200, so it was not kept.
In the sandbox the browsers cannot reach anything but this machine (a
black-hole proxy for every other host). The read-only specs (`browse`, the
first `join` test, `account`, `membership`, `session`, `redirects`, the 404s
in `errors`, `slow`, search in `find` when `E2E_SEARCH_QUERY` /
`E2E_SEARCH_PATH` are set, and the phone projects' journey 1 and first
journey 2 test) also run against the real site with `E2E_BASE_URL` and the
dedicated test account; the rest skip themselves there.

### What CI runs, and where

Everything in step 2 and the browser journeys above also runs on GitHub's
runners (launch fix plan item 7), so a change that breaks sign-up turns CI red
without anyone starting the sandbox by hand. It runs in two halves.

**Every pull request, every push to `main`** (`.github/workflows/ci.yml`,
9 checks, a few minutes each):

| Check | What |
|---|---|
| Questura softprod scripts | the laptop deploy scripts' own tests |
| Questura server tests | `test:deploy` and `test:int` (about 2,670) |
| Questura server build | Payload build, generated types unchanged, server typecheck |
| Questura readiness integrations | `readiness:required` against Postgres 17 and Redis services; each failing test is named |
| Questura client tests | 324 tests, **0 skipped** (the job fails on any skip), plus the k6 supervisor policy test |
| Questura lint | server and client ESLint |
| Questura client typecheck | `tsc` for the client |
| Writer frontend / Writer backend | the ai-blog-writer app, not Questura |

**On every push to `main`, nightly at 07:23 UTC, on demand (Actions →
Questura safety net → Run workflow), and on a pull request labelled
`full-ci`** (`.github/workflows/questura-safety-net.yml`, 2 more checks, about
11 minutes; 11 checks in all on a labelled PR):

| Check | What, and the count it expects |
|---|---|
| Questura readiness stack and browsers | `readiness:stack -- up --build` on **Postgres 17** (Neon's major; the laptop sandbox stays on 16), then step 2 in order with the counts above: routes 119, payments 43, purchase 54, auth 29, oauth 71, faults 26, contracts all ok, front-door 96, `launch:verify` 43, restore 36 (17 → 17), cutover 66; then Playwright in Chromium and Firefox (75 passed, 1 skipped); then the production client build through OpenNext with the guard on and `scan:bundle` |
| Questura k6 negative controls | every load-test proof gate, preflight refusal and supervisor stop rule fails when its fault is injected into a loopback fake target |

Every check step in the stack job runs even when an earlier one fails, so one
red run names every broken check. A failed run uploads the Playwright report,
traces and the stack's logs as an artifact. Nothing in either workflow reaches
live Stripe, Google, a paid service or the laptop: the stack binds loopback,
every process loads `deny-outbound.cjs`, the browsers sit behind a black-hole
proxy, and the production build points at `*.questura-ci.invalid` through a
loopback TLS forwarder (`scripts/readiness/ci-tls-forward.mjs`).

The `full-ci` label only fires when it is added, so after new commits remove
it and add it back to run again. `gh pr edit --add-label` fails here; use
`gh api -X POST repos/Questurian/questurian/issues/<N>/labels -f 'labels[]=full-ci'`
(and `-X DELETE …/labels/full-ci` to remove it).

Proof that it catches a break: on PR #710 a throwaway commit let `?returnTo=`
accept an outside address. CI went red in two places: client tests (2 of
324 failed) and the browser journeys (`redirects.spec.ts`, 4 failed in
Chromium and Firefox). `readiness:routes` stayed green: it tests the server
routes, not the client's `returnTo` check. The revert went green.

## Before the first deploy

1. **Check the Railway variables.** Fill a copy of
   `infra/railway/server.env.template` (never commit it), then:

   ```bash
   pnpm --dir apps/questura/apps/server env:check path/to/filled.env
   ```

   It must say the server would boot. It also refuses leftover placeholders,
   test-mode Stripe keys, loopback databases, sandbox variables and one secret
   used twice, a missing Resend key, a missing sender or one not on
   questurian.com (`EMAIL_FROM_ADDRESS`), a missing or malformed
   `SENTRY_DSN`, and a missing `ORIGIN_AUTH_SECRET` (the API front door,
   H01 step 8).

   Email DNS (SPF, DKIM, DMARC) must be verified in Resend before this:
   `docs/procedures/email-domain.md`, steps 1 to 5.

   Sentry receives a scrubbed test event before the DSN goes on Railway
   (`docs/procedures/sentry-setup.md`, step 4):

   ```bash
   SENTRY_DSN='<the DSN>' SENTRY_ENVIRONMENT=local-proof \
     pnpm --dir apps/questura/apps/server sentry:test-event   # expect "Sent test event <id>": 1 event in Sentry, [email]/[redacted] in it, no originals
   ```

   **Backups and the migration guard are on before the first deploy.** Follow
   the one-time setup in `docs/procedures/backup-restore-rollback.md`: Neon
   history retention reads **7 days**, the R2 bucket and its 30-day rule
   exist, and the manual run of *Questura daily backup* ends with
   `Stored questura-<stamp>.dump in the off-Neon bucket` (1 dump and 1
   `.sha256` in the bucket). Railway's *Config-as-code* path is
   `/apps/questura/infra/railway/railway.json`. The first deploy's log must
   show the pre-deploy step `Checking pending database migrations`.
   Both guard suites pass:

   ```bash
   pnpm --dir apps/questura/apps/server test:deploy     # expect 13 passed: migration guard + PR migration check
   pnpm --dir apps/questura/apps/server test:softprod   # ends "railway pre-deploy tests passed", "daily backup tests passed"
   ```

2. **Rehearse locally once more** (laptop, one heavy job at a time):

   ```bash
   pnpm --dir apps/questura/apps/server readiness:stack -- up --build
   pnpm --dir apps/questura/apps/server readiness:routes     # expect 119/119: includes redirects never leaving the site
   pnpm --dir apps/questura/apps/server readiness:payments   # expect 43/43
   pnpm --dir apps/questura/apps/server readiness:purchase   # expect 54/54: a whole purchase, refunds and disputes, a failed card (past_due, grace, portal), paused, a deleted customer, fake Stripe (basil-shaped)
   pnpm --dir apps/questura/apps/server readiness:auth       # expect 29/29: sign-in and sessions, attacked
   pnpm --dir apps/questura/apps/server readiness:oauth      # expect 71/71: Google linking (fake Google), staff/visitor isolation
   pnpm --dir apps/questura/apps/server readiness:faults     # expect 26/26: Stripe, Redis, Postgres failing (Postgres frozen: 503 in ~17 s, ready 503 in ~2 s; articles locked: member body 503 + Retry-After in ~5 s)
   pnpm --dir apps/questura/apps/server readiness:contracts  # expect all ok: response shapes match both apps' types
   pnpm --dir apps/questura/apps/server readiness:front-door # expect 96/96: the origin refuses callers who skip Cloudflare (webhooks, Google, admin included), health answers, every launch page renders with the site sending the secret itself, the secret in no log
   pnpm --dir apps/questura/apps/server launch:verify -- \
     --client http://app.readiness.localhost:3100 \
     --api http://api.readiness.localhost:4100 \
     --bypass http://127.0.0.1:4110 --edge-ip 127.0.0.1:4110 \
     --local --allow-http --home /zz-launch/harbor \
     --media http://media.readiness.localhost:3190 # expect 43/43 passed, then NOT RUN: rate-limit probe, cookie check
   pnpm --dir apps/questura/apps/server readiness:restore    # expect 35/35: dump, restore, boot, search, member sign-in on the restored database
   READINESS_CUTOVER_TARGET_URI=postgres://postgres@127.0.0.1:5463/questura_readiness_cutover \
   READINESS_PG_BINDIR=<dir with pg_dump/psql 17> \
     pnpm --dir apps/questura/apps/server readiness:cutover  # expect 66/66: moving day on a throwaway Postgres 17 with every secret rotated (docs/procedures/cutover.md)
   ```

   `readiness:cutover` needs a throwaway Postgres 17 on a spare loopback port
   first (the command is in `docs/procedures/cutover.md`, "Running the
   rehearsal again"); remove it afterwards.

   The full restore on Neon's Postgres major (17): bootstrap and seed a
   `questura_readiness` database in a throwaway Postgres 17 container, start
   the stack pointed at it, then (`docs/procedures/backup-restore-rollback.md`,
   "Measured so far"):

   ```bash
   export READINESS_DATABASE_URI=postgres://postgres@127.0.0.1:<spare port>/questura_readiness
   pnpm --dir apps/questura/apps/server readiness bootstrap && pnpm --dir apps/questura/apps/server readiness:launch -- seed
   pnpm --dir apps/questura/apps/server readiness:stack -- up
   READINESS_PG_BINDIR=<dir with pg_dump/psql 17> READINESS_RESTORE_EXPECT_MAJOR=17 \
     pnpm --dir apps/questura/apps/server readiness:restore   # expect 36/36 (35 + the Postgres 17 gate)
   ```

   Without a free stack slot, `readiness:restore -- --db-only` on the same
   container proves the database half: 29/29, 7 skipped, "PARTIAL".

   The sandbox's images come from its fixture media server
   (`media.readiness.localhost:3190`), so the image check runs there too.
   `--media` names that server as the one loopback host besides the site and
   the API that its pages may contain; it is refused without `--local`.
   `--no-image-check` is left for a sandbox started without the media server
   (printed as NOT RUN). Against the real site the image check always runs.

   `--local` is also sandbox-only, and refused for any host that is not this
   machine. It is what lets the sandbox leave out `--rate-limit-probe`, which
   fails there by design (the Cloudflare stand-in does not overwrite
   `CF-Connecting-IP`, so forged addresses do buy fresh budgets: the hole
   ADR-0016 closes on the platform). Both lockdown probes still run in the
   sandbox, against the locked backend on 4110. Without `--local`, a run that
   leaves out `--bypass`, `--edge-ip`/`--origin-edge` or `--rate-limit-probe`
   refuses to start (exit 2). The optional signed-in cookie check proved 10/10
   in the sandbox with `member-b`'s session (53/53 in all).

   The client build itself refuses to start without real `https` addresses
   and a `pk_live_` key, and fails if its output mentions `localhost`. The
   sandbox build opts out by name (`QUESTURA_BUILD_TARGET=readiness`); the real
   build is H01 step 19, which ends with:

   ```bash
   pnpm --dir apps/questura/apps/client scan:bundle   # expect: no localhost or loopback addresses in .next/static, .open-next/assets
   ```

## After the deploy

3. **Run the launch checks against the real domains.** Read-only.

   ```bash
   dig +short <the CNAME target api.questurian.com points Cloudflare at>   # Railway's edge address
   read -rs LAUNCH_VERIFY_COOKIE && export LAUNCH_VERIFY_COOKIE           # paste the test account's session cookie, not echoed
   LAUNCH_VERIFY_COOKIE_MEMBER=no pnpm --dir apps/questura/apps/server launch:verify -- \
     --client https://www.questurian.com \
     --api https://api.questurian.com \
     --bypass https://<service>.up.railway.app \
     --edge-ip <Railway's edge address from dig> \
     --rate-limit-probe            # expect every check passed and no NOT RUN line
   ```

   `--bypass`, `--edge-ip` (or `--origin-edge <origin>`, the same probe given
   as an address rather than an IP; give one, not both) and
   `--rate-limit-probe` are required: leaving one out refuses to start instead
   of dropping those checks from an all-green result. Only an answer proves a
   lock. A DNS, TLS or connection error on either lockdown probe is reported
   as `unknown: DNS (…)`, `unknown: TLS (…)` or `unknown: connection refused`
   and fails: it means the address is wrong, not that the origin is locked. A
   generated domain you deleted still answers Railway's own 404 at its edge,
   which passes (confirm that on the day, PL1). The edge probe ignores the
   certificate, as a caller skipping Cloudflare would.

   **The signed-in cookie check** needs a dedicated test account: sign up once
   on the real site with an address you own (not your purchase account, not a
   member), then copy its session cookie: DevTools → Network → the `me`
   request → Cookies → the value of `__Secure-questura_visitor.session_token`.
   It is read from the environment at run time and never printed; never
   commit or paste it anywhere else. It checks the cookies are `__Secure-`,
   `HttpOnly`, `Secure`, `SameSite=Lax` and host-only on the API host (no
   `Domain`: the site reads membership through `/api/me`, never the cookie),
   that signed-in `/api/me` is `no-store` with `Vary: Cookie`, and that the
   account reads as the member state you declare in
   `LAUNCH_VERIFY_COOKIE_MEMBER`. Without the cookie the run still passes and
   prints `NOT RUN: the signed-in cookie check`.

   It checks https and HSTS, framing headers, health, the advertised prices
   ($12.99 / $79.99), signed-out and foreign-origin callers on every payment
   route, webhook signature refusal, that the Railway origin does not serve
   the API, that a caller who connects to Railway's edge as
   `api.questurian.com` without the origin secret gets 403 (H01 step 8), and
   that forged IP headers do not buy a fresh rate-limit budget, and the
   signed-in cookie contract.
   On the home page, an article (the first in the sitemap) and an author page
   it checks for `localhost`/`127.0.0.1`, that the canonical and `og:url` are
   absolute on the site's host, that robots.txt and the sitemap name only this
   site, that one image loads as `image/*`, that a made-up path is a real 404,
   and that the site's JavaScript calls the `--api` origin.
   The last one uses up one caller's `/plans` budget for a minute.

   The read-only browser specs, with the dedicated accounts (a member for
   `E2E_MEMBER_*`, a non-member for `E2E_NONMEMBER_*`; never the purchase
   account). They sign in and read; the specs that write skip themselves.
   Written to run here, proven so far only in the sandbox:

   ```bash
   E2E_BASE_URL=https://www.questurian.com E2E_MEMBER_ARTICLE=<a member article path> E2E_MEMBER_TEXT=<text only members see> \
   E2E_MEMBER_EMAIL=… E2E_MEMBER_PASSWORD=… E2E_NONMEMBER_EMAIL=… E2E_NONMEMBER_PASSWORD=… \
   E2E_SEARCH_QUERY=<a query with exactly one result> E2E_SEARCH_PATH=<the path it opens> \
     pnpm --dir apps/questura/apps/e2e exec playwright test --project='chromium*' --project='firefox*'   # expect no failures; the sandbox-only tests show as skipped
   ```

   Every API response carries a request id, and errors reach Sentry:

   ```bash
   curl -sI https://api.questurian.com/api/health | grep -i '^x-request-id:'   # expect 1 line
   ```

   Sentry → Issues: nothing new from the deploy itself. The forced-error drill
   (one API error, one website error, each one event with a request id, alert
   on the phone) is PL4, with the owner present.

4. **The Stripe side** (live key, read-only):

   ```bash
   pnpm --dir apps/questura/apps/server verify:stripe-webhook-events   # no MISSING, not DISABLED (customer.deleted included, since item 11)
   QUESTURA_RECONCILE_APPLY=0 pnpm --dir apps/questura/apps/server reconcile:nightly   # 0 changes
   ```

   Stripe Dashboard → Webhooks → the new endpoint: recent deliveries all 200.

5. **Email lands in the inbox.** Request a password reset for a Gmail and an
   Outlook address you own. Both arrive in the inbox, from the configured
   sender, and "show original" says SPF, DKIM and DMARC all **pass**
   (`docs/procedures/email-domain.md`, step 6).

6. **First real purchase, owner only.** One real card, one real $12.99
   charge, then a full refund. Follow `live-checks/launch-purchase.html`:
   purchase → return page → member article → account page → portal (change
   nothing) → cancel → reactivate → cancel → refund in the Dashboard, with the
   expected database row, `/api/me`, Stripe state and email after each step.
   Within a minute of the refund, access is gone **and** the subscription is
   cancelled in Stripe; then the reconcile dry run shows 0 changes. The page
   also lists what never to do (no dispute, no second card, no test mode as
   evidence, no load on checkout). `live-checks/payments.html` is the laptop's
   page and does not apply here.

## If a check fails

Stop and read the failure; each one names what it saw. Roll back the side
that broke (the Worker first if both, or if you can't tell). A code rollback
never reverses a migration. For restoring data, see
`docs/procedures/backup-restore-rollback.md`. Nothing in steps 1–4 writes anything,
so re-running them is always safe.
