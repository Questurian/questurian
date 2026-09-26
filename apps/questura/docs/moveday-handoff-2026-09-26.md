# Move-day handoff, 2026-09-26

From the coordinating session that finished the launch fix plan on the owner's
Mac (2026-09-25) to a fresh session that provisions the real hosting and runs
moving day. Read this whole file, then `AGENTS.md`, then
`docs/procedures/cutover.md` (the runbook), then
`docs/capacity/h01-provisioning-checklist.md` (the provisioning steps).

**Nothing is deployed yet.** `questurian.com` answers Cloudflare 530 because the
Linux laptop's live window is paused; that is expected.

## 1. Where things stand

Merged on `main`, all CI green:

- The launch fix plan: every "before announcing" item (#693–#716). Item 15
  (mutation testing) is after launch. See `launch-fix-handoff-2026-09-25.md`.
- #713: the readiness sandbox runs on the Mac without docker.
- #717: Sentry is set up (org `questurian-5x`, US region, project
  `questura-server`, scrubbing on, "email on every new issue" alert). The
  sentry-cli token is in `~/.sentryclirc`.
- #718: the server is pinned to Node 22 (`engines.node: 22.x`); sign-in also
  survives Node 24 now.
- #719: `STRIPE_MANAGED_PAYMENTS` (Stripe as merchant of record for sales tax),
  **off** until Stripe approves. See cutover.md "Sales tax" (T1–T5).
- #720: **the database merge.** The Mac's `google-login` DB on :5432 has the
  newer content; the laptop's DB has the real members and payment history.
  Moving day dumps both and merges (`apps/server/scripts/cutover/merge-databases.sh`),
  rehearsed on real dumps into Postgres 16 and 17. Never cut over from one side.

Email: `hello@` and `dmarc@questurian.com` forward to the owner's Gmail
(Cloudflare Email Routing); a `_dmarc` p=none record exists; Resend's DNS
records were already present. Send from `hello@questurian.com`.

## 2. The owner's keys: the vault

The owner ran `~/questura-homework.sh` (a wizard; it validated every key).
Everything is in `~/.questura-vault/owner.env` (dir 700, file 600):

| Name | What it is | Where it goes |
|---|---|---|
| `CLOUDFLARE_SETUP_API_TOKEN` | "Edit Cloudflare Workers" template + D1 Edit, DNS Edit, Transform Rules Edit, Cache Purge, User API Tokens Edit; zone questurian.com | your Cloudflare work (wrangler: `CLOUDFLARE_API_TOKEN`). Mint the Worker's purge-only token and the R2 backup credentials with it. Owner deletes it after move day. |
| `RAILWAY_API_TOKEN` | Railway token (account or workspace; `me` may be "Not Authorized" for a workspace token) | Railway CLI/API |
| `NEON_API_KEY` | Neon personal API key | `neonctl` / Neon API |
| `STRIPE_APP_KEY` | **narrow** live restricted key `questura-api-railway`, verified: Checkout Sessions W, Customer portal W, Customers W, Subscriptions W, Invoices R, Charges and Refunds W, Prices R, Products R; payouts/transfers/webhooks blocked | Railway `STRIPE_SECRET_KEY` |
| `STRIPE_OPS_KEY` | live restricted key `questura-ops`: Read on everything, Write on Webhook Endpoints, Products, Prices; cannot refund or pay out. **Mac only, never on a server.** Long-lived. | creating the new webhook endpoint (cutover step 2), reading price ids, setting the product tax code (T3) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_…` | the Worker build `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| `RESEND_SETUP_KEY` | Resend full-access key | check the domain is verified, create the server's **sending-only** key. Owner deletes it after move day. |

Rules:
- Read the vault **only inside scripts** (`set -a; source …; set +a`), pipe
  values straight into `railway variables`, `wrangler secret put`, `gh secret
  set`. Never `cat`, echo, log or paste a value; redact keys in any output you
  show (`sed -E 's/(rk|sk|pk)_live_[A-Za-z0-9]+/…/g'`).
- Never store Stripe's full `sk_live` key anywhere.
- The owner also turned on Cloudflare **Workers Paid**, Railway **Hobby**, a
  **paid Neon plan** (7-day restore window), and set Stripe's support email to
  `hello@questurian.com`.

Values you make yourself (cutover.md "Every key, and where it lives"): all the
**new** random secrets (`PAYLOAD_SECRET`, `BETTER_AUTH_SECRET`,
`ORIGIN_AUTH_SECRET`, revalidation/render/refresh/db-stats/exchange-rate
secrets). Copy from the laptop's `~/questura/config/server.env` by script,
never printed: `GOOGLE_CLIENT_ID/SECRET`, the `BUNNY_*` values. Sentry DSN:
via the sentry-cli token (`/api/0/projects/questurian-5x/questura-server/keys/`).
Price ids: with `STRIPE_OPS_KEY` (the **catalog** $12.99 / $79.99 prices, not
the laptop's $0.50). Backup GitHub secrets: `gh` is logged in.

## 3. What to do, in order

Setup (no downtime, the laptop stays paused):

1. Install CLIs: `brew install railway` (or the Railway GraphQL API),
   `neonctl` (`npx neonctl`), wrangler is in the client package. Prove each
   authenticates from the vault.
2. **Neon** (H01 Part A): project `questura`, **same region as Railway**
   (pick one US region for both), scale-to-zero off, read `max_connections`,
   7-day history. Postgres 17.
3. **Railway** (H01 Part B): project `questura`, service root
   `apps/questura/apps/server`, config-as-code
   `/apps/questura/infra/railway/railway.json`, Redis in the same project,
   `TRUSTED_PROXY=cloudflare`, all variables (`env:check` must pass on a filled
   copy of `infra/railway/server.env.template`, never committed).
   `STRIPE_MANAGED_PAYMENTS` unset. Node 22 comes from `engines.node`.
4. **Cloudflare** (H01 Part C): R2 bucket `questura-incremental-cache`, D1
   `questura-tag-cache` (put its id in `wrangler.jsonc`: the one fake value),
   purge-only token, Worker secrets, the Transform Rule for
   `api.questurian.com`, build in a worktree, deploy.
5. Stripe webhook endpoint (cutover step 2) with `STRIPE_OPS_KEY`, all ten
   events on `2025-08-27.basil`; its signing secret goes straight to Railway.
6. Backups: `docs/procedures/backup-restore-rollback.md` "One-time setup".

Then moving day with the owner present: cutover.md steps 3–15 (Google redirect
URI is an owner click; freeze editing on **both** machines; dump both, merge,
restore into Neon, compare counts, deploy, `launch:verify`, D6).

Then, site live but quiet: T1 (owner requests Managed Payments) → approval →
T3–T5 → PL3 load test (owner sets the spending cap, D8) → PL4 alert drill →
retire the laptop (cutover steps 16–19) → announce.

## 4. Waiting on the owner

- **Move-day date** (a few hours, present for the Google click, D6 and the
  $12.99 purchase).
- **D6**: the 2 members paying the laptop's $0.50.
- **D8**: spending cap for the real load test. **D9**: Redis full-memory policy
  (never "refuse writes").
- After the merge, articles 17 and 32 and itineraries 12, 13, 15, 16, 17 are
  members-only (set on the laptop 2026-08-16). Ask if that was a test.
- After the move: point the writer tool (ABW) and Location Manager at
  `https://api.questurian.com`; never edit the Mac's :5432 DB again.

## 5. This Mac

- Repo: `~/Desktop/questurian` (not `~/Projects`). pnpm 10, **Node 22** for
  everything: `source ~/.nvm/nvm.sh; nvm use --silent 22`. The Mac default is 24.
- No docker. Homebrew `postgresql@16` and `@17`. The sandbox recipe is in
  `launch-day.md` "Sandbox setup" (host Postgres 16 on 5442, `LC_ALL=en_US.UTF-8`).
- `:5432` is **real data** (the content source for the merge): read only.
  The laptop (`ssh linux-laptop`) is reachable; its `questura-postgres` is live
  data: read only until cutover step 4 parks it.
- Bunny CDN is shared and live: ask before writing to it.
- Stripe is live mode on this account (`acct_1I5Gsj`); `acct_1RwPJK` is only a
  sandbox. Never touch the Mac's `stripe` CLI device key.

## 6. How to work (what the owner asked for)

- The owner wants a fresh coordinator that uses **subagents** for the heavy
  parts (e.g. one per platform: Neon, Railway, Cloudflare, backups), run one at
  a time where they depend on each other (Neon → Railway → Cloudflare).
- The owner wants **everything done from the CLI/API**, not browser
  instructions. If a permission is missing, ask once for the exact scope.
- **Ask before changing a script the owner is running**, and never claim
  something works before testing both the pass and the fail case.
- Talk in simple words. Lead with the plain result.
- Nothing deploys to the real domains, and no DNS changes happen, without the
  owner's go for that step.
