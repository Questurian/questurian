export type MembershipSource = 'stripe' | null

export type MembershipFields = {
  subscriptionStatus?: string | null
  paidThroughAt?: string | null
  dunningGraceUntil?: string | null
  cancelAtPeriodEnd?: boolean | null
  billingInterval?: string | null
  subscriptionPaused?: boolean | null
}

export type VisitorMembership = {
  active: boolean
  source: MembershipSource
  status: string
  expiresAt: string | null
  graceUntil: string | null
  cancelAtPeriodEnd: boolean
  /** How often the subscription bills; null until a resync has recorded it. */
  interval: 'month' | 'year' | null
}

function isFuture(value: string | null | undefined): boolean {
  if (!value) return false

  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return false

  return at > new Date()
}

/**
 * Access is a question about dates, not about Stripe's status enum (ADR-0008).
 *
 * Reading `subscriptionStatus` directly is what revoked a paying visitor's
 * access the moment one renewal charge failed, while Stripe went on retrying
 * that card for weeks. `paidThroughAt` covers time actually paid for, and
 * `dunningGraceUntil` covers a recoverable failure; either one being in the
 * future means the visitor is entitled.
 */
function hasActiveStripeMembership(profile: MembershipFields | null | undefined): boolean {
  if (!profile) return false

  return isFuture(profile.paidThroughAt) || isFuture(profile.dunningGraceUntil)
}

export function deriveVisitorMembership(profile: MembershipFields | null | undefined): VisitorMembership {
  const active = hasActiveStripeMembership(profile)

  return {
    active,
    source: active ? 'stripe' : null,
    // D5: a paused subscription is stored as past_due plus a flag (see
    // VisitorProfiles); the client is told it is paused.
    status: profile?.subscriptionPaused ? 'paused' : (profile?.subscriptionStatus ?? 'none'),
    expiresAt: profile?.paidThroughAt ?? null,
    graceUntil: profile?.dunningGraceUntil ?? null,
    cancelAtPeriodEnd: Boolean(profile?.cancelAtPeriodEnd),
    interval: profile?.billingInterval === 'month' || profile?.billingInterval === 'year' ? profile.billingInterval : null,
  }
}
