import { describe, expect, it } from 'vitest'

import { deriveVisitorMembership } from './membership-entitlement'

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

describe('deriveVisitorMembership', () => {
  it('treats an active subscription as an entitled Stripe membership', () => {
    expect(deriveVisitorMembership({ subscriptionStatus: 'active' })).toEqual({
      active: true,
      source: 'stripe',
      status: 'active',
      expiresAt: null,
      cancelAtPeriodEnd: false,
    })
  })

  it.each([
    ['cancelled', FUTURE, true],
    ['cancelled', PAST, false],
    ['cancelled', null, false],
    ['none', FUTURE, true],
    ['none', PAST, false],
    ['none', null, false],
  ])('status %s with expiration %s → active: %s', (subscriptionStatus, membershipExpiration, active) => {
    const membership = deriveVisitorMembership({ subscriptionStatus, membershipExpiration })

    expect(membership.active).toBe(active)
    expect(membership.source).toBe(active ? 'stripe' : null)
    expect(membership.status).toBe(subscriptionStatus)
    expect(membership.expiresAt).toBe(membershipExpiration)
  })

  it('treats past_due as not entitled, even with a future expiration', () => {
    const membership = deriveVisitorMembership({
      subscriptionStatus: 'past_due',
      membershipExpiration: FUTURE,
    })

    expect(membership.active).toBe(false)
    expect(membership.source).toBe(null)
    expect(membership.status).toBe('past_due')
  })

  it.each([null, undefined])('treats a missing profile (%s) as not entitled', (profile) => {
    expect(deriveVisitorMembership(profile)).toEqual({
      active: false,
      source: null,
      status: 'none',
      expiresAt: null,
      cancelAtPeriodEnd: false,
    })
  })

  it('defaults a missing status to none and does not grant entitlement', () => {
    const membership = deriveVisitorMembership({})

    expect(membership.status).toBe('none')
    expect(membership.active).toBe(false)
  })

  it('passes cancelAtPeriodEnd through without affecting entitlement', () => {
    const membership = deriveVisitorMembership({
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: true,
      membershipExpiration: FUTURE,
    })

    expect(membership.active).toBe(true)
    expect(membership.cancelAtPeriodEnd).toBe(true)
    expect(deriveVisitorMembership({ subscriptionStatus: 'none', cancelAtPeriodEnd: null }).cancelAtPeriodEnd).toBe(
      false
    )
  })
})
