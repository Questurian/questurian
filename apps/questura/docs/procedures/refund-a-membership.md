# Procedure: refund a membership

**Who this is for:** anyone with Stripe Dashboard access who needs to give a visitor their money back.

You do this in Stripe. Do not edit the Questura admin, the database, or the Linux host. The site hears the refund from Stripe and turns off access on its own.

Verified live on 2026-08-17 (full refund of a real $12.99 Apple Pay charge, profile 9).

---

## Pick the right action

| They want… | You do… | They keep this month’s articles? | They get billed again? |
|---|---|---|---|
| Money back, lock the content | **Full refund** in Stripe | No | No — the app cancels the subscription |
| Stop next month, they already paid for this one | **Cancel** (account page, or Cancel in Stripe). Do **not** refund | Yes, until the paid-through date | No |
| Small goodwill / tax tweak, keep membership | **Partial refund** in Stripe | Yes | Yes |

There is no “request a refund” button on the site. Cancel is the visitor-facing option. Refund is a support action.

---

## Full refund (the usual support case)

1. Open [Stripe Dashboard → Payments](https://dashboard.stripe.com/payments).
2. Find the visitor (email is enough).
3. Open the charge you are returning.
4. Click **Refund**.
5. Refund **in full**. Do not leave a remainder.
6. Confirm. Wait about 10 seconds.

That is the whole job. You do not also cancel in Stripe, and you do not also cancel in the Questura admin. The app does both.

### What the site does next

Stripe sends `charge.refunded`. The app then:

1. Marks the subscription as refunded (`access_revoked = refund`).
2. Cancels the subscription so Stripe does not charge them next month.
3. Clears `paidThroughAt` on their Visitor profile, so paid articles lock again.

### Check that it worked

In [Stripe](https://dashboard.stripe.com/payments):

- The payment shows **Refunded**.
- The subscription shows **Canceled**.
- Subscription metadata includes `access_revoked = true` and `access_revoked_reason = refund`.

In Questura admin → Visitor profiles, that person should show:

- `subscriptionStatus` = `cancelled`
- `paidThroughAt` = empty

If `paidThroughAt` still has a date a minute later, the webhook did not land. Do not “fix” it by editing the profile. Check the live Stripe webhook endpoint (`https://cms.questurian.com/api/payments/webhooks/stripe`) and try the refund event again from Stripe, or ask engineering.

---

## What not to do

- **Do not refund and then also cancel in the app.** Redundant. Harmless most of the time, but the refund is the action that matters.
- **Do not use a partial refund** if you mean “take away membership.” Partial refunds are ignored on purpose so a $1 correction does not lock someone out.
- **Do not refund from the Mac or from localhost.** Live Stripe lives on the Linux host. Support uses the Dashboard.
- **Do not expect the Stripe processing fee back.** Stripe keeps the fee on the original charge. Tell the visitor the paid amount returns; the fee does not.
- **Do not expect Apple Pay / cards to show the money instantly.** Stripe marks the refund succeeded immediately. The card network can take a few days.

---

## If they only want to cancel

Tell them to cancel from their Questurian account page, or cancel the subscription in Stripe **without** refunding.

They keep access until `paidThroughAt`. That is intentional: they already paid for the period.

---

## Why this exists

A full refund used to leave access on, and Stripe kept billing, because live Stripe was not sending `charge.refunded` even though the code handled it. That is fixed. This procedure is how support uses that fix: refund in Stripe, and trust the site to lock the account.
