/**
 * Nightly reconcile, step `emails`: put a reader's current address back on
 * their Stripe customer when the two have drifted apart.
 *
 * An email change reaches Stripe only through `syncStripeCustomerEmail`, run
 * once when the new address is verified, and that call is best-effort by
 * design (a Stripe outage must not cost anyone a verified address). A failed
 * sync used to be logged and forgotten, leaving receipts and dunning mail
 * going to the old address, and the old address on a live customer where the
 * next person to register it could be mistaken for its owner.
 *
 * Rules:
 *  - The reader's current address is `visitor_auth_users.email`, which only
 *    ever changes after the new address is verified.
 *  - Only a customer that names the reader as its owner
 *    (`metadata.visitorAuthUserId`, the rule in `customer-linkage.ts`) is
 *    written to. Anything else is the `profiles` step's business and is
 *    counted here, never touched.
 *  - Each write re-reads the reader's address first, so an email change made
 *    while the scan ran is never overwritten with the older one.
 *  - A plan larger than `maxApply` writes nothing: mass drift means a wrong
 *    key or account, not forty real changes.
 */

import type { ReconcileStepResult } from './reconcile-report'
import { exceedsApplyCap } from './reconcile-report'

/** A profile linked to a Stripe customer, with the reader's current address. */
export type LinkedReader = {
  authUserId: string
  stripeCustomerId: string
  email: string
}

export type CustomerEmailView = {
  id: string
  email: string | null
  owner: string | null
  deleted: boolean
}

export type EmailSyncDeps = {
  linkedReaders(): Promise<LinkedReader[]>
  customer(id: string): Promise<CustomerEmailView | null>
  /** The reader's address now, read again just before a write. */
  currentEmail(authUserId: string): Promise<string | null>
  updateCustomerEmail(id: string, email: string): Promise<void>
}

const normalize = (email: string | null | undefined) => (email ?? '').trim().toLowerCase()

export async function reconcileCustomerEmails(
  deps: EmailSyncDeps,
  options: { apply: boolean; maxApply: number | null },
): Promise<ReconcileStepResult> {
  const lines: string[] = []
  const counts = {
    email_checked: 0,
    email_drift: 0,
    email_synced: 0,
    email_failed: 0,
    email_not_owner: 0,
    email_missing: 0,
  }

  const planned: Array<{ reader: LinkedReader; from: string | null }> = []
  for (const reader of await deps.linkedReaders()) {
    counts.email_checked += 1
    const customer = await deps.customer(reader.stripeCustomerId)
    if (!customer || customer.deleted) {
      counts.email_missing += 1
      continue
    }
    if (customer.owner !== reader.authUserId) {
      counts.email_not_owner += 1
      continue
    }
    if (normalize(customer.email) === normalize(reader.email)) continue
    counts.email_drift += 1
    planned.push({ reader, from: customer.email })
    lines.push(`DRIFT     ${reader.stripeCustomerId} (reader ${reader.authUserId}): Stripe has a different address than the account`)
  }

  if (!options.apply || planned.length === 0) {
    if (planned.length > 0) lines.push(`dry run: ${planned.length} customer address(es) would be updated`)
    return { ok: true, counts, lines }
  }

  if (exceedsApplyCap(planned.length, options.maxApply)) {
    lines.push(`REFUSED   ${planned.length} address updates exceed the cap of ${options.maxApply}; nothing written`)
    return { ok: false, counts, lines, reason: 'email-cap-exceeded' }
  }

  for (const { reader } of planned) {
    try {
      const now = await deps.currentEmail(reader.authUserId)
      if (!now) {
        counts.email_missing += 1
        lines.push(`SKIPPED   ${reader.stripeCustomerId}: the reader no longer exists`)
        continue
      }
      await deps.updateCustomerEmail(reader.stripeCustomerId, normalize(now))
      counts.email_synced += 1
      lines.push(`SYNCED    ${reader.stripeCustomerId}: Stripe now has the account's address`)
    } catch (error) {
      counts.email_failed += 1
      lines.push(`FAILED    ${reader.stripeCustomerId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { ok: counts.email_failed === 0, counts, lines }
}
