export type MembershipSource = 'stripe' | null

export type MembershipFields = {
  subscriptionStatus?: string | null
  membershipExpiration?: string | null
  cancelAtPeriodEnd?: boolean | null
}

export type VisitorMembership = {
  active: boolean
  source: MembershipSource
  status: string
  expiresAt: string | null
  cancelAtPeriodEnd: boolean
}

function hasActiveStripeMembership(profile: MembershipFields | null | undefined): boolean {
  if (!profile) return false
  if (profile.subscriptionStatus === 'active') return true

  if (
    (profile.subscriptionStatus === 'cancelled' || profile.subscriptionStatus === 'none') &&
    profile.membershipExpiration
  ) {
    return new Date(profile.membershipExpiration) > new Date()
  }

  return false
}

export function deriveVisitorMembership(profile: MembershipFields | null | undefined): VisitorMembership {
  const active = hasActiveStripeMembership(profile)

  return {
    active,
    source: active ? 'stripe' : null,
    status: profile?.subscriptionStatus ?? 'none',
    expiresAt: profile?.membershipExpiration ?? null,
    cancelAtPeriodEnd: Boolean(profile?.cancelAtPeriodEnd),
  }
}
