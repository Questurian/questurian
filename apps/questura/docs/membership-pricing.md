# Membership pricing

> **Since 2026-09-26 Checkout charges the catalog: $12.99/month, $79.99/year.**
> The Linux laptop is retired and live runs on Railway + Cloudflare + Neon.
> The $0.50 laptop test price is not used by any checkout; the two $0.50
> subscriptions were refunded and canceled. Sections below that describe the
> laptop switch and `stripe-live` are historical. Move record:
> `docs/procedures/cutover.md` and `docs/moveday-handoff-2026-09-26.md`.

## One product

Stripe product **Questurian Membership** (`prod_V4XBrsC0ai3ZOY`) is the only
membership product. Monthly, yearly, and the old laptop test charge (unused)
are **prices on that product**. Do not create another product for testing.

## Two numbers, on purpose

| What | Amount | Where it lives |
|---|---|---|
| **Catalog** (what the site says) | **$12.99 / month**, **$79.99 / year** | `membership-catalog.ts` → `/api/payments/plans` → server-rendered `/join`, client `/purchase` |
| **Nav Subscribe button** | **`Join: $1.54/wk` / `Subscribe: under $1.55/wk`** | Hardcoded in `SubscribeButton.tsx`. Not a bug. Do not wire plans/Stripe into it. |
| **Old laptop test charge** (retired, used by no checkout) | $0.50 / month | Was the laptop's `STRIPE_PRICE_ID_MONTHLY` |

The site advertises the catalog and Checkout charges it. The laptop used to
charge $0.50 so live Checkout could be proven cheaply; that ended with the
laptop. Do not treat $0.50 as the product.

The only forbidden mismatch: advertising **less** than Stripe will charge.

## What enforces that

`getPurchasablePlan()` in `membership-plans.ts`. It retrieves the configured
price from Stripe and refuses the plan outright when the price disagrees with
`MEMBERSHIP_CATALOG` on:

- **billing interval** — a "yearly" price that actually bills monthly
- **interval count** — anything other than every 1 interval
- **currency** — anything other than the catalog currency
- **amount** — *above* the catalog amount. Below is allowed (that is what let
  the old laptop test charge through).

It also refuses when Stripe cannot be reached at all, rather than guessing.

**Both the pricing page and Checkout go through it.** They did not always:
`/api/payments/plans` validated and `POST /api/payments/create-checkout-session`
did not, so a bad `STRIPE_PRICE_ID_*` dropped the plan from `/join` with only a
log line while `/purchase/yearly` — which posts `{"plan":"yearly"}` without ever
loading the pricing page — kept charging it.

A refused plan is a **400 `That plan is not available right now.`** on Checkout
and a missing entry on `/api/payments/plans`. If the buy button starts returning
that, the `STRIPE_PRICE_ID_*` variables on the Railway API are the thing to look at,
and the reason is in the server log (`Configured membership price does not match
the catalog`, or `Stripe would charge more than the catalog price`).

## Launch (done 2026-09-26)

Monthly and yearly point at the catalog price IDs on the Railway API.
Advertised = charged.

## Switch: $0.50 test charge ↔ real catalog charge (historical, laptop only)

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

## Sales tax: Stripe Managed Payments (off until Stripe approves)

Checkout charges **no tax** today: the price is the whole charge. Tax is
handed to Stripe instead of being handled here: with **Stripe Managed
Payments** Stripe (through Link) is the merchant of record and calculates,
collects, files and remits sales tax/VAT in 80+ countries, for +3.5% per sale.

- **Switch:** `STRIPE_MANAGED_PAYMENTS=on|off` on the API host, **off** by
  default. Anything else refuses to boot. Code:
  `features/payments/lib/managed-payments.ts`.
- **Off:** Checkout gets exactly the parameters it always had (a test pins them
  byte for byte), card and Link only. `/join` says "All prices are in U.S.
  dollars." and nothing about tax.
- **On:** Checkout sends `managed_payments[enabled]=true` and drops
  `payment_method_types` (Stripe forbids it; it picks the methods per buyer).
  Everything else is unchanged: same price, customer, metadata, promotion-code
  and 3DS choices. `/api/payments/plans` answers `taxAtCheckout: true` and
  `/join` adds "Sales tax or VAT is added at checkout where it applies, and
  checkout may show the total in your own currency."
- **Prices stay $12.99 / $79.99 before tax.** The price's tax behaviour is left
  unset, so Stripe adds tax on top where it applies. The catalog check above
  is unaffected: it reads the price, not the charged total.
- **Only new checkouts.** A subscription bought while the switch was off
  (including the $0.50 laptop ones) stays unmanaged for its life, with no tax.
- **Who does what once on:** Stripe sends receipts and invoices from Link, the
  card statement reads `LINK.COM* …`, Stripe answers disputes (and may accept
  one) and may refund a buyer through Link support within 60 days. Access
  still follows the webhooks: a full refund or a lost dispute ends it exactly
  as now, whoever pressed the button.
- **Turning it on** needs Stripe's approval and a tax code on the product.
  Steps: `docs/procedures/cutover.md`, "Sales tax: turn on Stripe Managed
  Payments".

## Stripe CLI (historical: laptop key is being deleted)

Live Stripe reads now use the restricted read key in the owner's vault
(`~/.questura-vault/owner.env`, read only inside scripts, never printed). Still
never the Mac CLI device key. The text below described the laptop era;
`stripe-live` stops working once the laptop key is deleted.

Use the **`questura-linux-laptop`** restricted key (host `STRIPE_SECRET_KEY`,
suffix `…1dDj`). Never the Mac `CLI key for Rubens-iMac-2.local` (`…qnwG`).

Stripe CLI ignores live keys in `~/.config/stripe/config.toml`. From the Mac:

```bash
apps/questura/scripts/stripe-live <stripe args>
```

That wrapper pulls the laptop key over ssh and passes `--api-key`. Do not copy
the secret onto the Mac.

## Local join preview and rendering

`/join` renders its static copy, globe, and plan cards on the server. When
`NEXT_PUBLIC_FRONTEND_URL` explicitly names localhost, 127.0.0.1, or ::1, it
renders both catalog plans synchronously with a local-preview label. The
arrow controls have no href and are marked disabled. No payment API is called.
These fixtures contain no Stripe price IDs and are never checkout inputs.

On deployed origins, `/join` reads the existing validated plans endpoint on
the server, cached for 60 seconds, with a three-second request timeout. A slow
cold read can stream after the hero; a failure or empty response shows the
unavailable state, never local fixtures. Availability changes may take a cache
window to appear; checkout still independently validates the chosen plan.
`/purchase` and backend checkout validation are unchanged.

For a local production-mode comparison, override the older production env
file at both build and start time:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000 NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000 pnpm --dir apps/client build
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000 NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000 pnpm --dir apps/client start --port 3000
```
