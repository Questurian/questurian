# Launch fix plan: handoff, 2026-09-25

Handoff from the coordinating Claude session on the Linux laptop to a fresh session on another machine. Read this whole file before doing anything.

**Nothing here has been deployed.** This is all pre-launch work merged to `main`. The site has not moved, the laptop's live window is paused, and no paid hosting exists yet.

## 1. What this is

The owner asked for `apps/questura/docs/launch-fix-plan-2026-09-24.html` to be carried out end to end, with helper agents, and every item merged to `main`. The plan is the source of truth for each item's Problem / Fix / Done when / Amendments. The detailed "how" for each item is the matching prompt in `apps/questura/docs/test-gap-audit-2026-09-24.html`. Where the two differ, the plan wins.

The owner delegated every decision to the plan's recommendations. This is recorded in the plan's Decisions section (PR #692):
- **D1 = yes** (Sentry).
- **D3 = yes** (load-test key, with the guard rails).
- D2, D4, D5 and D7 as recommended.
- D6, D8 and D9 stay go-live decisions, made with the owner present.

The owner wants to be hands-off:
- Lean into the best decision.
- Merge your own PRs after green CI (see the memory "merge own PRs").
- Only come back for things only the owner can do: account sign-ups, logins, live config, money.

## 2. Status

| Item | State | PR |
|---|---|---|
| 0 Sandbox setup | merged | #693 |
| 1 Build and config traps | merged | #696 |
| 2 Refunds and disputes (basil) | merged | #698 |
| 16 Time zones | merged | #694 |
| 17 Small correctness | merged | #699 |
| 11 Failed-card dead ends | merged | #702 |
| 4 Email | merged | #695 |
| 3 Error reporting | merged. **Sentry test event pending the owner's DSN** | #697 |
| 10 API front door | merged | #704 |
| 5 Cutover rehearsal | merged | #706 |
| 12 Backups and rollback | merged | #700 |
| 6 Launch-day kit | merged | #707 |
| 8 Browser journeys | merged | #708 (a), #709 (b) |
| extra: DB-down rejection spam, `/x.y` returns 500 | merged | #703 |
| extra: missing itinerary returns 200 instead of 404 | merged | #705 |
| 7 Safety net in CI | merged | #710 |
| **14 Account lifecycle** | **draft: finish it** (readiness proven, Playwright re-run left) | #711 |
| **13 Speed budgets** | not started | none |
| **9 Load test and baseline** | not started | none |
| **15 Test honesty (mutation)** | not started. The coordinator moved it to **after launch** (the plan allows this) | none |
| PL1–PL4 | Phase 5, on real hosting with the owner present. **Not part of this run** | none |

Every "before go-live" item is merged. What's left is "before announcing": items 7, 14, 13 and 9.

## 3. What to do next, in order

### 3.1 Finish item 7 (#710)

Read the PR's "Handoff status" comment first. Item 7 runs almost entirely on GitHub runners, so it doesn't need the local sandbox.

1. Rebase on `origin/main`.
2. Do the red-proof:
   - Push a throwaway commit that breaks one readiness check. For example, let `returnTo` accept an outside address, which should turn `readiness:routes` and `redirects.spec.ts` red.
   - Re-add the `full-ci` label and confirm CI goes red.
   - `git revert` the commit and push.
3. Re-add the label and get all 11 checks green on the final commit.
4. Re-run "Questura readiness integrations" a couple of times to catch the unexplained 1-in-90 failure on Postgres 17.
5. Add a "What CI runs, and where" section to `launch-day.md`.
6. Tick item 7 in the plan, mark the PR ready, and squash-merge.

### 3.2 Finish item 14 (#711)

Read the PR's "Handoff status" comment first. All readiness suites passed: auth 30, the new account suite 49, the rest unchanged. There is no migration. Item 14 needs the sandbox, so it can run beside item 7 (CI-only) but not beside 13 or 9.

1. Rebase on `origin/main`.
2. `pnpm readiness:stack -- up`. Add `--build` only if `.next-readiness` is gone.
3. Run Playwright twice. Expect **79 passed + 1 skipped**. The first run had 10 failures; they were test issues, and the fixes are committed but not re-run yet.
4. Update the Playwright line and the spec table in `launch-day.md`.
5. Tick item 14 in the plan.
6. Stop the stack, mark the PR ready, wait for CI, and squash-merge.

### 3.3 Add `/terms` and `/faq` (small PR, after item 14)

`/join` links to and preloads both pages, and both return 404 today.
- Write short, plain pages from what the code actually does, in the site's visual language (read `foundations.css` first).
- Flag the wording for the owner to review, as with `/privacy`.
- Then remove the `/terms` and `/faq` 404 allowance that item 14 added to the privacy spec.

### 3.4 Item 13 (speed budgets)

Do this after items 7 and 8, which both give it what it needs.
- Set budgets 10% above the measured values, capped at LCP ≤ 2.5 s, CLS ≤ 0.1 and JS ≤ 170 KB gzip per route.
- `useReportWebVitals` reports into item 3's sink. The website has no Sentry SDK; it uses the beacon `POST /api/client-errors`. Extend that endpoint, or add a sibling endpoint for vitals.
- No Lighthouse CI without the owner's yes.
- Journey 12 (slow network) already records a timing that can seed a baseline.
- Wire the budgets into CI, in item 7's `questura-safety-net.yml`.

### 3.5 Item 9 (load test and post-upgrade baseline)

Do this last, once every other code item has landed, with nothing else running.
- D3 is approved, with these guard rails:
  - the load identity is off by default;
  - the key is 32+ characters;
  - every use is logged;
  - it is only on during the test window;
  - `launch:verify` fails while it's set.
- Write `docs/capacity/runs/<date>-post-upgrade-baseline.md`, and say plainly that these are laptop or local numbers.
- For a fair before/after, run the baseline on the same kind of machine as the earlier baselines. If the new machine is not the Linux laptop, say so in the write-up and compare with care.

### 3.6 Item 15

Leave it for after launch. The plan's tracker already notes this.

### 3.7 Wrap up

When everything above is merged:
- Update the plan's tracker.
- Write the owner a short summary in plain words, including what's left for them (section 6).

### How to run the work

This approach worked:
- One coordinating session spawns one helper agent per item, using the plan's "One prompt for any item" plus the gotchas in section 5.
- Only one sandbox job runs at a time.
- A light job (unit tests only, or CI-only) can run beside it in a separate git worktree.
- Every helper commits and pushes after each milestone. Usage limits and one app crash interrupted agents five times, and pushed work survived every time.

**Cost note from the owner.** The owner's monthly usage limit was hit repeatedly. Most of the spend came from helpers re-running the whole launch-day sequence to prove each item: a full build, about 11 readiness suites, and Playwright in two browsers. Item 7 now puts that full sequence into CI (the `full-ci` label, push to main, and nightly). So:
- Locally, run only the suites your change touches.
- Let CI's full run be the proof.
- Keep helper prompts tight.

## 4. Setting up the new machine

The sandbox was built and proven on the Linux laptop (Ubuntu, 7.5 GB RAM, Docker 29). On a new machine:

```bash
cd ~/Projects/questurian
git checkout main && git pull
pnpm install --frozen-lockfile
```

### Tools

- **Node 22** (the laptop has v22.23.2) and **pnpm 10.0.0** (pinned by `packageManager`; `corepack enable` works).
- **Docker** is required.
  - The sandbox runs `questura-readiness-pg` (postgres:16 on 127.0.0.1:5442, tmpfs).
  - When no local `redis-server` exists, it also runs `questura-readiness-redis` (redis:7-alpine on 127.0.0.1:6390).
  - Items 12 and 5 also use throwaway postgres:17 containers on spare ports.
- **Playwright browsers:** `pnpm --dir apps/questura/apps/e2e exec playwright install chromium firefox`. The laptop had chromium-1243 and firefox-1543.
- **Postgres 17 client:** only needed for running backups by hand, because `pg_dump` 16 refuses a 17 server. The scripts use docker for it.
- **gh:** must be logged in with the `workflow` scope.
  - On the laptop, account `alanmalpartida` had `repo, workflow, read:org, gist`. A second account, `alantothe`, is also logged in.
  - Push workflow files with `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push …`.
- **sentry-cli** 3.8.0 was installed on the laptop (`npm i -g @sentry/cli@3.8.0`) for the owner's Sentry login. Install it on the new machine too if the owner does the login there.

### Memory

The plan's memory rules:
- Check free memory before heavy work.
- Never build while the readiness stack is up.
- Build with `NODE_OPTIONS="--no-deprecation --max-old-space-size=3072"`.

On a bigger machine you can relax "one light job beside one sandbox job", but still never run two sandbox jobs, because the ports are fixed.

### If the new machine is the Mac

AGENTS.md says the Mac is the default runtime.
- There is no live Postgres or Redis on the Mac. The Mac's stale `google-login` Postgres is on **5432**; the sandbox never uses 5432, so keep it that way.
- Check early that `*.localhost` subdomains resolve for both Node and browsers. The fixture media server is `media.readiness.localhost:3190`. Chrome and Firefox resolve it, but Node's resolver on macOS may not.
- Before any item work, run `pnpm readiness:stack -- up --build`, then launch-day step 2, once. Fix any Mac-only failure in its own small PR.
- Give Docker Desktop at least 6 GB of memory, enough for postgres, redis and the builds.
- The live-window laptop commands (`ssh linux-laptop …`) are only for live verification, which is out of scope here.

### Never touch

From AGENTS.md and the plan:
- the laptop's live Postgres on **5433** and Redis on **6379**, and the `questura-postgres` / `questura-redis` containers;
- live Stripe (`rk_live`), the Mac's `stripe` CLI device key, and live Google.

Also:
- no deploys, and no `resume-live.sh`;
- no load against anything outside the local machine;
- no paid services;
- no new dependencies without the owner's yes (Sentry is approved).

## 5. Gotchas the helpers learned (give these to every helper)

### Sandbox

- **Stack lifecycle:**
  - `pnpm readiness:stack -- up --build` works from a clean session (item 0).
  - `stack -- down` leaves `questura-readiness-pg` up on purpose, because it holds the seeded data. Deleting it is safe: `up` reseeds it in about 10 s.
  - After a crash, a stale `/tmp/questura-readiness/stack.json` blocks `stack up`. Run `stack -- down` first.
- **Ports:**
  - The backend is on **4110**.
  - The Cloudflare stand-in is on **4100**. It adds the origin header, and its stats are at `/__edge/stats`.
  - Fixture media is at **media.readiness.localhost:3190**.
  - Direct calls to 4110 get 403 without the origin header (`stack.secrets.originAuth`).
- **Redis:** clear only the `payments:rate-limit:*` keys in sandbox Redis (`clearSandboxRedisKeys` in `sandbox-redis.ts`). Clearing all of Redis signs everyone out.
- **Test accounts and limits:**
  - `member-b` must end every run as a member, because the browser tests rely on it.
  - The per-visitor checkout limit is 8 a minute.
  - Spec files use random fake visitor addresses, because of per-address rate limits.
- **Stripe fake:** it runs from source, so after editing it a stack down/up is enough, with no rebuild. It has `/__fake/...` controls: refund, dispute, close dispute, `customers/:id/delete` and `checkout/:id/reopen`.
- **`readiness:adapter`** always builds `origin/main`. To prove a client change on OpenNext before merge, temporarily change `adapter-smoke.ts` line ~79 to `revision(REPO, 'HEAD')`. Revert it afterwards, along with its run file.
- **Run files:** runs rewrite `docs/capacity/runs/readiness-sandbox.json` and `docs/capacity/runs/*-surge-*.json`. Revert them unless they're evidence for your change.
- **No outside traffic:** sandbox browsers route every non-local host to a dead proxy. This was added after two debug runs reached the real accounts.google.com.
- **Home page:** the sandbox has no `/peru/lima`, so `/` 404s there. This is allowlisted in the sandbox only.
- **Rare #418:** a React 19.1 hydration #418 on `/account` hits about 1 in 70 fast loads. It is allowed once per browser context. The real fix needs a React/Next upgrade, which needs the owner's yes.
- **Killing processes:** never `pkill -f` on patterns like `wrangler` or `opennext`; it killed agents' own shells. Kill by the PID listening on the port.

### Code and repo

- **Next version:** Next is **15.5.x**, not 16, despite what some docs say.
- **`build` folders:** `apps/questura/.gitignore` ignores any folder named `build`, so files in one are silently left out of commits.
- **Production-shaped client builds:**
  - They need https API and site URLs, a `pk_live_…` key and `ORIGIN_AUTH_SECRET`.
  - The sandbox sets `QUESTURA_BUILD_TARGET=readiness` to skip the guard.
  - Never let a build or test reach the real `api.questurian.com`. Use `.invalid` hosts.
- **Migrations:**
  - The CI migration-safety check (item 12) fails risky SQL (DROP, enum additions, rewrites) unless the PR body has `Acknowledge-risky-migration: <name>`. Deploying such a migration needs the manual restore-point procedure.
  - Prefer additive schema changes. Item 11 made "paused" a flag for this reason.
  - Payload schema changes follow AGENTS.md's migration steps.
- **CI:**
  - The plan's wait loop must fit in a 10-minute tool call: use 45 rounds of 10 s.
  - Count the checks correctly: 9 on a normal PR, 11 with `full-ci`.
  - `gh pr edit --add-label` fails with a GraphQL error. Use `gh api -X POST repos/Questurian/questurian/issues/<N>/labels -f 'labels[]=full-ci'` instead.
  - On a PR, the safety net only re-runs when the label is re-added.
- **After pulling:**
  - Run `pnpm install --frozen-lockfile`. Item 3 added `@sentry/nextjs` 10.75.3 to the server, and without it the server typecheck fails.
  - The server typecheck also needs the generated `payload-types.ts` (`pnpm generate:types`). CI does this for itself.

### Expected counts

These are the counts on `main`; `launch-day.md` is the source of truth. #711 changes auth to 30, adds account 49, and takes Playwright to 79 + 1 skipped.

| Check | Expected |
|---|---|
| routes | 119 |
| payments | 43 |
| purchase | 54 |
| auth | 29 |
| oauth | 71 |
| faults | 26 |
| contracts | all ok |
| front-door | 96 |
| cutover | 66 |
| launch:verify | 43 (53 with the cookie check) |
| restore | 35 (36 on Postgres 17) |
| Playwright | 75 passed + 1 skipped |
| client unit tests | 324 |
| server unit tests | about 2,670 |

## 6. Waiting on the owner (not blocking the remaining items)

### 6.1 Sentry account (for item 3's test event)

The owner:
1. Signs up at https://sentry.io/signup (Google is fine), with org name `questurian`.
2. Creates a personal token at https://sentry.io/settings/account/api/auth-tokens/ with `org:read`, `project:read`, `project:write` and `project:admin`.
3. Runs `sentry-cli login` and pastes the token.

After that, the agent:
1. Creates one project, `questura-server`, through the Sentry API and reads its DSN.
2. Runs:
   ```bash
   SENTRY_DSN='<dsn>' SENTRY_ENVIRONMENT=local-proof pnpm --dir apps/questura/apps/server sentry:test-event
   ```
3. Checks that the event shows `[email]` and `[redacted]` instead of the real values.

Never commit the DSN.

### 6.2 Laptop live config

Before the laptop's next deploy, add this to `~/questura/config/server.env` on the laptop, or the server refuses to start (item 4):

```
EMAIL_FROM_ADDRESS=noreply@questurian.com
```

A mailbox the owner reads is better, because the security emails invite replies. Alternatively, set `EMAIL_REPLY_TO` to one. The coordinator was not permitted to edit live config.

### 6.3 Other decisions and checks

- **React/Next upgrade** for the rare `/account` #418. It's a dependency change, so it needs a yes. Low urgency: React recovers, and readers still see the page.
- **Email wording:** the membership confirmation email promises "priority support" and "advanced analytics". That's the owner's call.
- **Mailbox and page wording (item 14):**
  - Confirm `hello@questurian.com` is a mailbox someone reads; account-deletion requests go there.
  - Review the `/privacy` wording, and `/terms` and `/faq` once they're written.
- **Branch protection** on `main`: there is none today. If wanted, require the 9 `ci.yml` checks.

### 6.4 At go-live

Phase 5 happens with the owner, and everything is in the runbooks:
- `docs/procedures/cutover.md`: every secret and where it lives, and D6. The secrets are:
  - `SENTRY_DSN`;
  - `ORIGIN_AUTH_SECRET`, in Railway, as a Worker secret, and in the Cloudflare Transform Rule;
  - `EMAIL_FROM_ADDRESS` and `RESEND_API_KEY`;
  - the backup secrets;
  - the new Stripe webhook endpoint, at `2025-08-27.basil` with all ten events, including `customer.deleted`.
- `docs/procedures/email-domain.md`: Resend, plus SPF, DKIM and DMARC.
- `docs/procedures/backup-restore-rollback.md`: Neon's 7-day point-in-time restore, the daily R2 copy, and the GitHub secrets.
- `docs/procedures/sentry-setup.md`.
- `live-checks/launch-purchase.html`: the owner's one $12.99 purchase, through to the refund.
- `launch-day.md`.

## 7. Real bugs the plan's work caught (for context)

- A chargeback revoked nothing, because Stripe basil removed `charge.invoice` (#698).
- Google sign-in failed in Chrome for every new reader: the `Critical-CH` header caused a double callback (#708).
- Buyers weren't returned to the article they paid for (#708).
- A cookie could redirect the home page off-site (#699).
- A refunded reader who pressed Subscribe again got their already-paid checkout page (#702).
- For 24 hours after a Stripe customer was deleted, creating a customer brought the deleted one back, because creation used a reusable request key (#702).
- Reader names went unescaped into emails, which made them a phishing vector from our domain (#695).
- Location Manager's upload returned 500 for requests that weren't file uploads (#706).
- Cancel and reactivate showed stale state, failed article renders showed a bare "500", and the 404 page had no navigation (#709).
- `/privacy`, `/terms` and `/faq`, all linked from `/join`, returned 404. `/privacy` is added in #711; `/terms` and `/faq` are still to do.
- The real cause of the `/account` #418 was Suspense hydration timing in `useAuth` (#708).

## 8. Prompt to paste into the fresh session

> You are the coordinator continuing the launch fix plan in the questurian monorepo. Start with `git checkout main && git pull && pnpm install --frozen-lockfile`. Read, in full: `AGENTS.md`, then `apps/questura/docs/launch-fix-handoff-2026-09-25.md` (this handoff), then the plan `apps/questura/docs/launch-fix-plan-2026-09-24.html` (Decisions, Rules for every job, and items 7, 14, 13, 9). Set up the machine per handoff section 4 and prove the sandbox once (`pnpm readiness:stack -- up --build`, launch-day step 2, Playwright), fixing any machine-specific failure in its own small PR. Then do handoff section 3 in order: finish #710 (item 7) and #711 (item 14), which can run side by side because item 7 is CI-only; then add `/terms` and `/faq`; then item 13; then item 9. Item 15 is moved to after launch. Use one helper agent per item, with the plan's "One prompt for any item" plus the gotchas in handoff section 5. Run one sandbox job at a time. Helpers commit and push after each milestone and squash-merge their own PR after green CI. Keep token spend low: locally, run only the suites a change touches, and let CI's full safety net (the `full-ci` label) be the full proof. Nothing deploys, and nothing touches live Stripe, live Google or the laptop's live ports. The owner is hands-off: decide routine things yourself, and only ask them for the items in handoff section 6. When done, update the plan tracker and give the owner a short summary in plain words.
