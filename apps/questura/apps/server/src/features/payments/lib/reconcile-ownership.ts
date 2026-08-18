/**
 * Who does this Stripe customer belong to?
 *
 * The checkout path already answers this: `customer-linkage.ts` refuses to
 * adopt a Stripe customer on an email match, because a customer's email is
 * written once at creation and nothing syncs it afterwards — so an address a
 * visitor has since abandoned sits on their customer, free for the next signup
 * to claim. This account also predates the site and holds hand-made customers.
 * `metadata.visitorAuthUserId` is stamped by us at creation and is the only
 * claim of ownership either path trusts.
 *
 * The nightly reconciliation used to disagree with that: an unlinked profile
 * that merely shared the customer's email was adopted, and the same write that
 * stamped `stripeCustomerId` also copied `paidThroughAt` and
 * `subscriptionStatus` off that customer's subscription. Nightly, unattended,
 * apply-on-by-default. One hit hands a stranger the payer's billing portal —
 * card last four, invoices, cancel button — plus a free membership.
 *
 * So the rule lives here, once, as a pure function both the script and its
 * tests can use, and email is demoted to what it always was: a hint worth
 * reporting, never a proof worth writing.
 */

/** The parts of a visitor profile this rule reads. */
export type OwnableProfile = {
  id: string | number
  authUserId?: string | null
}

export type ReconcileTarget<P extends OwnableProfile> =
  /** Ownership is proven; linkage and subscription state may be written. */
  | { kind: 'update'; profile: P }
  /**
   * The profile already carrying this `stripeCustomerId` is not the one Stripe
   * says owns the customer. Something linked it wrongly before; writing money
   * state to it now would compound that, so it is reported and skipped.
   */
  | { kind: 'mismatched'; profile: P }
  /**
   * No proof of ownership, but profiles carry the customer's email. This is
   * exactly the case the old code auto-applied. Report only.
   */
  | { kind: 'unproven' }
  /** Nothing on this side at all — the caller's ORPHANED/historical bucket. */
  | { kind: 'none' }

export function normalizeAuthUserId(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Decide which profile — if any — a Stripe customer may be reconciled onto.
 *
 * `linkedProfile` is the profile already holding this `stripeCustomerId`;
 * `ownedProfile` is the profile whose `authUserId` equals the customer's
 * `metadata.visitorAuthUserId`. `emailCandidateCount` is only ever used to tell
 * "unproven" apart from "nothing there".
 */
export function resolveReconcileTarget<P extends OwnableProfile>(input: {
  customerOwnerAuthUserId: string | null | undefined
  linkedProfile: P | null | undefined
  ownedProfile: P | null | undefined
  emailCandidateCount: number
}): ReconcileTarget<P> {
  const owner = normalizeAuthUserId(input.customerOwnerAuthUserId)

  // An existing linkage is itself the proof: it was written by a checkout that
  // resolved ownership, or by a previous proven repair. Only Stripe explicitly
  // naming a different owner overrides it.
  if (input.linkedProfile) {
    if (owner && normalizeAuthUserId(input.linkedProfile.authUserId) !== owner) {
      return { kind: 'mismatched', profile: input.linkedProfile }
    }
    return { kind: 'update', profile: input.linkedProfile }
  }

  // Lost linkage, repairable: the customer names its owner and that account
  // still exists. This is the case the script was written for, and it survives
  // the ownership rule intact.
  if (owner && input.ownedProfile) {
    return { kind: 'update', profile: input.ownedProfile }
  }

  return input.emailCandidateCount > 0 ? { kind: 'unproven' } : { kind: 'none' }
}
