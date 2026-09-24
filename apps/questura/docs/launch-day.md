# Launch day: what to run, in order

Everything here was written and proven before launch, against the readiness
sandbox (a production build on the laptop, no network, no Stripe). On the day
you run it; you do not write it. Steps marked **owner** need your yes.

Platform plan: `docs/capacity/cap07-platform-readiness.md` §1a. Clicks:
`docs/capacity/h01-provisioning-checklist.md`. Origin decision: ADR-0016.

## Before the first deploy

1. **Check the Railway variables.** Fill a copy of
   `infra/railway/server.env.template` (never commit it), then:

   ```bash
   pnpm --dir apps/questura/apps/server env:check path/to/filled.env
   ```

   It must say the server would boot. It also refuses leftover placeholders,
   test-mode Stripe keys, loopback databases, sandbox variables and one secret
   used twice.

2. **Rehearse locally once more** (laptop, one heavy job at a time):

   ```bash
   pnpm --dir apps/questura/apps/server readiness:stack -- up --build
   pnpm --dir apps/questura/apps/server readiness:routes     # expect 114/114
   pnpm --dir apps/questura/apps/server readiness:payments   # expect 43/43
   pnpm --dir apps/questura/apps/server readiness:purchase   # expect 22/22: a whole purchase, fake Stripe
   pnpm --dir apps/questura/apps/server readiness:auth       # expect 29/29: sign-in and sessions, attacked
   pnpm --dir apps/questura/apps/server launch:verify -- \
     --client http://app.readiness.localhost:3100 \
     --api http://api.readiness.localhost:4100 \
     --allow-http --home /zz-launch/harbor                  # expect all passed
   ```

## After the deploy

3. **Run the launch checks against the real domains.** Read-only.

   ```bash
   pnpm --dir apps/questura/apps/server launch:verify -- \
     --client https://www.questurian.com \
     --api https://api.questurian.com \
     --bypass https://<service>.up.railway.app \
     --rate-limit-probe
   ```

   It checks https and HSTS, framing headers, health, the advertised prices
   ($12.99 / $79.99), signed-out and foreign-origin callers on every payment
   route, webhook signature refusal, that the Railway origin does not serve
   the API, and that forged IP headers do not buy a fresh rate-limit budget.
   The last one uses up one caller's `/plans` budget for a minute.

4. **The Stripe side** (live key, read-only):

   ```bash
   pnpm --dir apps/questura/apps/server verify:stripe-webhook-events   # no MISSING, not DISABLED
   QUESTURA_RECONCILE_APPLY=0 pnpm --dir apps/questura/apps/server reconcile:nightly   # 0 changes
   ```

   Stripe Dashboard → Webhooks → the new endpoint: recent deliveries all 200.

5. **First real purchase, owner only.** One real card, one real charge, then
   a refund. Follow `live-checks/payments.html`, checking the database row
   and `/api/me` at each step, and end with the refund and the loss of access.

## If a check fails

Stop and read the failure; each one names what it saw. `rollback` on the
platform restores the previous deploy. Nothing in steps 1–4 writes anything,
so re-running them is always safe.
