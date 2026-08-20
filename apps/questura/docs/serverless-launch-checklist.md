# Serverless launch checklist

What has to be true before the site takes money from someone who is not the
owner. The Linux laptop is a live-like test environment with an expiry date
(`infra/softprod/README.md`); this is the list of things that do not travel
with the repository and must be redone on the real platform.

**Nothing here is a code change.** The payments code is audited and the known
correctness gaps are closed. Every item below is configuration, and every item
below is a real blocker — the site is not launchable with any of them open.

## 0. Choose the platform first

Six of the seven items resolve from one decision, so make it before starting.
`TRUSTED_PROXY` (item 2) only recognises `cloudflare`, `vercel`, `netlify` and
`fly` (`src/shared/config/trusted-proxy.ts`); anything else needs its header
added there, deliberately, with the reasoning that file already sets out.

## 1. Charge the catalog price

**Blocker. The site advertises $12.99/month and $79.99/year and Checkout
currently takes $0.50/month.** That mismatch is deliberate while the laptop is
the test runtime, and it stops being defensible the moment a stranger can buy.

Point the price env at the catalog IDs and restart:

```
STRIPE_PRICE_ID=price_1U4P3aBUOUSxLiOZfKskTKeO
STRIPE_PRICE_ID_MONTHLY=price_1U4P3aBUOUSxLiOZfKskTKeO
STRIPE_PRICE_ID_YEARLY=price_1U4P3bBUOUSxLiOZMGh7ZrJL
```

`getPurchasablePlan` verifies each against `MEMBERSHIP_CATALOG` at request time
and refuses a price that bills on the wrong interval, in the wrong currency, or
above the catalog amount. A refused plan is a 400 on Checkout and a missing
entry on `/api/payments/plans`, with the reason in the server log.

Full rule and the switch both ways: `docs/membership-pricing.md`.

Note that the nav Subscribe button copy (`Join: $1.54/wk`) is hardcoded and is
not driven by any of this. Check it still reads correctly against the catalog
price; do not wire it to Stripe.

## 2. Set `TRUSTED_PROXY` before the first deploy, not after

**Blocker, and order-sensitive.** Production refuses to boot without it
(`assertProductionConfig`), which is the good failure. The bad one is setting it
to the wrong platform: the rate limiters then identify callers from a header
the caller writes, and every limit is bypassable. Reading `X-Forwarded-For`
first was a *verified live* rate-limit bypass, not a theoretical one.

Set it to the platform actually terminating the request, and keep the origin
unreachable except through that proxy — the header says nothing about a caller
who reaches the origin directly.

## 3. Rotate `PAYLOAD_SECRET` and `BETTER_AUTH_SECRET`

The laptop's secrets have lived on a machine that is deliberately slept, closed
and eventually retired. Generate new ones for the real platform. Rotating
invalidates existing sessions — do it at cutover, not after visitors have
signed in.

## 4. Move the database

The live DB is `questura` on port 5433 inside the `questura-postgres` container
on the laptop. The Mac's local Postgres is stale scratch and is not a source of
truth for anything.

- Provision managed Postgres on the chosen platform
- Dump and restore, then run `pnpm db:migrate` and confirm `db:migrate:status`
- Check row counts on `locations`, `articles`, `media_assets`, `media_sets`,
  `users`, `visitor_profiles` and the `visitor_auth_*` tables against the source
- **Set up real backups.** What exists today is one 1.8 MB `pg_dump -Fc` sitting
  on the same disk as the database it came from, taken by hand. That is not a
  backup, and after launch it is customer data.

Media is on Bunny and does not move with the database.

## 5. Repoint the Stripe webhook endpoint

New origin means a new endpoint, a new signing secret, and the event list has
to be set explicitly.

- Create the endpoint on the new domain, set `STRIPE_WEBHOOK_SECRET`
- Enable every event in `handled-events.ts`
- Run `pnpm verify:stripe-webhook-events` and read the output

The `charge.*` events were never enabled on the current endpoint, so refund and
dispute revocation was dead code in live Stripe until 2026-08-16. It was
invisible because a webhook that is never delivered looks exactly like a webhook
with nothing to do. Verify rather than assume.

## 6. Schedule the nightly reconcile

`pnpm reconcile:nightly` has no home on a serverless platform — there is no
long-lived machine to run the timer. Pick the platform's scheduler.

It runs with apply on and a blast cap of 25 profiles. Confirm it is scheduled,
that it holds the same per-customer advisory lock the webhooks take, and that
its output goes somewhere a person will read.

## 7. Narrow the live Stripe key

The current `rk_live` was widened deliberately for the build phase, with the
owner's approval, on the understanding that it would be narrowed at this
cutover. Issue a key scoped to what the app actually calls and replace it.
Do not ship the build-phase key.

---

## Not blockers — decided, do not re-open

Audits keep re-proposing these. Each was looked at and settled; reverse one only
with new evidence, not a fresh argument.

| Item | Where | Decision |
|---|---|---|
| Cache `/api/payments/plans` | `membership-plans.test.ts` | Removed on purpose in `e8a69d1d` — disagreed across instances, checkout never used it. The rate-budget concern was answered in that same commit with per-visitor limits. |
| One-second ordering guard | `webhooks/stripe/route.ts` | Real, and survivable: every handler refetches from Stripe (ADR-0008), so a same-second loser still writes current state. Comment now says so. |
| Webhook resend past 30 days | `event-retention.ts` | Handlers converge on a second run; the two that mutate Stripe are idempotent in effect. Know it before resending an old event. |
| Nav Subscribe button copy | `SubscribeButton.tsx` | Hardcoded on purpose. Not driven from Stripe or `/api/payments/plans`. |
| Advertised price vs laptop charge | `docs/membership-pricing.md` | Intentional until item 1 above. Never sync the UI down to $0.50. |
