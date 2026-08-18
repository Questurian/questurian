# Membership pricing (laptop vs launch)

This is the rule. Reviews that "fix" advertised prices to match Checkout are
wrong until serverless launch.

## One product

Stripe product **Questurian Membership** (`prod_V4XBrsC0ai3ZOY`) is the only
membership product. Monthly, yearly, and the cheap laptop test charge are
**prices on that product**. Do not create another product for testing.

## Two numbers, on purpose

| What | Amount | Where it lives |
|---|---|---|
| **Catalog** (what the site says) | **$12.99 / month**, **$79.99 / year** | `membership-catalog.ts` → `/api/payments/plans` → `/join`, `/purchase`, Subscribe button |
| **Laptop test charge** (what Checkout takes now) | **$0.50 / month** | Host `STRIPE_PRICE_ID_MONTHLY` → Stripe Checkout |

The site advertises the catalog. The laptop charges $0.50 so live Checkout can
be proven without a $12.99 hit every test. **That mismatch is intentional.**
Ignore it in reviews. Do not sync the UI down to $0.50. Do not treat $0.50 as
the product.

The only forbidden mismatch: advertising **less** than Stripe will charge.

## This is not launch

The Linux laptop is a live-like test environment, not production. Production
is serverless, later. **Catalog Stripe prices become what Checkout charges at
serverless deploy**, not before, unless someone deliberately switches (below)
for one real-price test.

## Switch: $0.50 test charge ↔ real catalog charge

Price IDs are also in `apps/questura/apps/server/src/features/payments/lib/membership-catalog.ts`.

Host file: `~/questura/config/server.env`. Then restart the server (env is
read at process start):

```bash
systemctl --user restart questura-server
```

**Laptop testing (current default) — charge $0.50/month:**

```
STRIPE_PRICE_ID=price_1U5aq5BUOUSxLiOZMnZHT1eS
STRIPE_PRICE_ID_MONTHLY=price_1U5aq5BUOUSxLiOZMnZHT1eS
```

**One real-price test — charge $12.99 / $79.99:**

```
STRIPE_PRICE_ID=price_1U4P3aBUOUSxLiOZfKskTKeO
STRIPE_PRICE_ID_MONTHLY=price_1U4P3aBUOUSxLiOZfKskTKeO
STRIPE_PRICE_ID_YEARLY=price_1U4P3bBUOUSxLiOZMGh7ZrJL
```

That is a real charge on the owner's live Stripe account. Confirm before
switching.

**Yearly while monthly is $0.50:** `STRIPE_PRICE_ID_YEARLY` is still the
catalog yearly price. Buying yearly on the laptop **charges $79.99**. Do not
click yearly unless that is intended.

**Serverless launch:** point both monthly and yearly at the catalog price IDs
and leave them there. Then advertised = charged.

## Stripe CLI (until serverless)

Use the **`questura-linux-laptop`** restricted key (host `STRIPE_SECRET_KEY`,
suffix `…1dDj`). Never the Mac `CLI key for Rubens-iMac-2.local` (`…qnwG`).

Stripe CLI ignores live keys in `~/.config/stripe/config.toml`. From the Mac:

```bash
apps/questura/scripts/stripe-live <stripe args>
```

That wrapper pulls the laptop key over ssh and passes `--api-key`. Do not copy
the secret onto the Mac.
