import { describe, expect, it } from 'vitest'

import { deriveVisitorMembership } from './membership-entitlement'

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

describe('deriveVisitorMembership', () => {
  it('entitles a visitor whose paid period has not ended', () => {
    expect(deriveVisitorMembership({ subscriptionStatus: 'active', paidThroughAt: FUTURE })).toEqual({
      active: true,
      source: 'stripe',
      status: 'active',
      expiresAt: FUTURE,
      graceUntil: null,
      cancelAtPeriodEnd: false,
    })
  })

  it.each([
    ['active', FUTURE, true],
    ['active', PAST, false],
    ['active', null, false],
    ['cancelled', FUTURE, true],
    ['cancelled', PAST, false],
    ['cancelled', null, false],
    ['none', FUTURE, true],
    ['none', PAST, false],
    ['none', null, false],
  ])('status %s paid through %s -> active: %s', (subscriptionStatus, paidThroughAt, active) => {
    const membership = deriveVisitorMembership({ subscriptionStatus, paidThroughAt })

    expect(membership.active).toBe(active)
    expect(membership.source).toBe(active ? 'stripe' : null)
    expect(membership.status).toBe(subscriptionStatus)
    expect(membership.expiresAt).toBe(paidThroughAt)
  })

  it('status alone never grants entitlement', () => {
    // The regression this guards: `subscriptionStatus === 'active'` used to
    // short-circuit to entitled, so a stale enum could outlive paid time.
    expect(deriveVisitorMembership({ subscriptionStatus: 'active' }).active).toBe(false)
  })

  it('keeps a past_due visitor entitled while the dunning grace runs', () => {
    // The P0 bug: one failed charge revoked access immediately, even though
    // Stripe was still retrying the card.
    const membership = deriveVisitorMembership({
      subscriptionStatus: 'past_due',
      paidThroughAt: PAST,
      dunningGraceUntil: FUTURE,
    })

    expect(membership.active).toBe(true)
    expect(membership.source).toBe('stripe')
    expect(membership.graceUntil).toBe(FUTURE)
  })

  it('drops a past_due visitor once the grace expires', () => {
    const membership = deriveVisitorMembership({
      subscriptionStatus: 'past_due',
      paidThroughAt: PAST,
      dunningGraceUntil: PAST,
    })

    expect(membership.active).toBe(false)
  })

  it('does not entitle a past_due visitor with no grace at all', () => {
    expect(
      deriveVisitorMembership({ subscriptionStatus: 'past_due', paidThroughAt: PAST }).active
    ).toBe(false)
  })

  it('ignores a malformed date rather than granting access', () => {
    expect(deriveVisitorMembership({ paidThroughAt: 'not-a-date' }).active).toBe(false)
  })

  it.each([null, undefined])('treats a missing profile (%s) as not entitled', (profile) => {
    expect(deriveVisitorMembership(profile)).toEqual({
      active: false,
      source: null,
      status: 'none',
      expiresAt: null,
      graceUntil: null,
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
      paidThroughAt: FUTURE,
    })

    expect(membership.active).toBe(true)
    expect(membership.cancelAtPeriodEnd).toBe(true)
    expect(deriveVisitorMembership({ subscriptionStatus: 'none', cancelAtPeriodEnd: null }).cancelAtPeriodEnd).toBe(
      false
    )
  })
})
