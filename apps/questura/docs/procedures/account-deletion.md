# Procedure: delete a reader's account on request

**Who this is for:** whoever reads the mailbox named on the account page and
in the privacy text (`hello@questurian.com`, `apps/client/src/lib/accountDeletion.ts`).

At launch there is no delete button (launch fix plan, decision D2). The site
promises: *email us from the address you sign in with and we delete your
account within 30 days.* This is how you keep that promise. It takes about ten
minutes, most of it waiting for Stripe.

---

## 1. Check the request

- It must come **from the address the account signs in with**. If it comes
  from anywhere else, reply to the account's address asking them to confirm
  from there. Never delete on a request you cannot tie to the address.
- Note the date. The 30 days start now.

## 2. Stripe first (Dashboard)

Search [Stripe → Customers](https://dashboard.stripe.com/customers) for the
address.

- **No customer:** skip to step 3.
- **A subscription that is active, past due or paused:** open it →
  **Cancel subscription** → **Immediately** (not at period end). Refund only
  if the reader asked for it or is owed it (`refund-a-membership.md`); the
  default is no refund for the days left. Wait about 10 seconds: the site
  hears `customer.subscription.deleted` and locks the membership.
- **Then delete the customer** (⋯ → Delete customer). This removes their
  card and address from Stripe; Stripe keeps its own record of past payments,
  as it must. The site hears `customer.deleted` and lets go of the customer.
  If you keep the customer instead (an open dispute, say), the site keeps an
  emptied billing record that still points at it, so a late Stripe event
  still finds it.

## 3. Erase the account (one command)

On a machine with the production environment (the same variables the API
runs with: `DATABASE_URI`, `REDIS_URL`, `BETTER_AUTH_SECRET`), dry run first:

```bash
pnpm --dir apps/questura/apps/server exec tsx scripts/erase-visitor-account.ts --email reader@example.com
# ERASE dry-run sessions=2 sign_in_methods=1 bookmarks=4 profile=deleted. Nothing changed; add --apply to erase.
```

If it says `ERASE refused: the membership has not ended`, step 2 has not
landed yet: check the subscription is **Canceled** in Stripe and wait a minute.
Then:

```bash
pnpm --dir apps/questura/apps/server exec tsx scripts/erase-visitor-account.ts --email reader@example.com --apply
# ERASE done sessions=2 sign_in_methods=1 bookmarks=4 profile=deleted
```

What `--apply` does, in order:

1. **Revokes every session**, in Redis and Postgres. Every device is signed
   out within about a second (the cookie cache is overridden by the
   revocation list, `session-revocations.ts`).
2. **Deletes** the bookmarks, any outstanding reset link, and the visitor
   profile. If the profile still names a Stripe customer (you kept it in
   step 2), it is **emptied** instead: name, address and billing address
   cleared, the Stripe linkage and membership dates kept.
3. **Deletes the sign-in account**: the Google link, the password and the
   user row.

It never calls Stripe, and it is safe to run again if it stops halfway. Run it
twice and the second run says `ERASE none`.

## 4. Confirm and reply

- Run the dry run again: it must say `ERASE none`.
- Reply to the reader from the same mailbox: their account is deleted, they
  are signed out everywhere, and Stripe keeps its payment records as the law
  requires. Keep their request and your reply (that is the record that you
  did it); delete nothing else from the mailbox.

---

## What is not deleted

- **Stripe's payment records**, which Stripe must keep. Deleting the customer
  removes the card and the address.
- **Server logs and error reports**, which age out on their own (they carry
  no email addresses: `docs/procedures/sentry-setup.md`).
- **Backups**, which age out with the backup retention
  (`backup-restore-rollback.md`). A restore from before the deletion brings
  the account back: after any restore, run step 3 again for every deletion
  made since the backup was taken.

## Proven

`pnpm --dir apps/questura/apps/server readiness:account` runs the dry run, the
refusal for a live member and the full erase against the sandbox on every
launch-day rehearsal (`docs/launch-day.md`).
