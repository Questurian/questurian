import assert from 'node:assert/strict'
import test from 'node:test'

import { getBillingInfo, getMembershipState } from './membership.service.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const inDays = (days) => new Date(Date.now() + days * DAY_MS).toISOString()

function visitor(fields) {
  return {
    kind: 'visitor',
    id: 'v_1',
    email: 'member@example.com',
    subscriptionStatus: 'active',
    subscriptionRenewsAt: null,
    membershipExpiration: null,
    dunningGraceUntil: null,
    cancelAtPeriodEnd: false,
    ...fields,
  }
}

// The reported bug: a disputed charge revokes entitlement without touching the
// subscription, so the status enum still reads `active` and the paid-through
// date is gone. The card used to answer that with "Premium Member".
test('a live subscription with no entitlement is not shown as a premium member', () => {
  const state = getMembershipState(visitor({ subscriptionStatus: 'active' }), false)

  assert.equal(state.type, 'access_paused')
  assert.notEqual(state.label, 'Premium Member')
  assert.match(state.description, /paused/i)
  // The subscription still exists and still bills; a second one is not the fix.
  assert.equal(state.showUpgradeButton, false)
})

// The stuck class `audit-access-revocations.ts` looks for: entitlement is gone
// but the profile still carries a period end, so the enum reads `active` and a
// renewal date is still sitting there.
test('a stuck profile is paused and advertises no billing date', () => {
  const user = visitor({ subscriptionStatus: 'active', subscriptionRenewsAt: inDays(-3) })

  assert.equal(getMembershipState(user, false).type, 'access_paused')
  assert.equal(getBillingInfo(user, false), null)
})

test('an entitled active subscription still reads as a premium member', () => {
  const user = visitor({ subscriptionStatus: 'active', subscriptionRenewsAt: inDays(20) })
  const state = getMembershipState(user, true)

  assert.equal(state.type, 'active')
  assert.equal(state.label, 'Premium Member')
  const billing = getBillingInfo(user, true)
  assert.equal(billing?.billingPeriod, 'Monthly')
  assert.ok(billing.nextBilling.length > 0)
})

test('an expiring membership with no entitlement stops promising a run-out date', () => {
  const state = getMembershipState(
    visitor({ cancelAtPeriodEnd: true, membershipExpiration: inDays(10) }),
    false
  )

  assert.equal(state.type, 'access_paused')
  assert.equal(state.showReactivateButton, false)
})

test('a cancelled membership with no entitlement stops saying "remains active until"', () => {
  const state = getMembershipState(
    visitor({ subscriptionStatus: 'cancelled', membershipExpiration: inDays(10) }),
    false
  )

  assert.equal(state.type, 'access_paused')
})

// The other direction of the same rule: states that never claimed access are
// left alone, so an ex-member keeps the button that sells them a membership.
test('an expired membership keeps its upgrade path', () => {
  const state = getMembershipState(
    visitor({ subscriptionStatus: 'cancelled', membershipExpiration: inDays(-10) }),
    false
  )

  assert.equal(state.type, 'expired')
  assert.equal(state.showUpgradeButton, true)
})

test('a lapsed dunning failure keeps its upgrade path', () => {
  const state = getMembershipState(
    visitor({ subscriptionStatus: 'past_due', dunningGraceUntil: inDays(-1) }),
    false
  )

  assert.equal(state.type, 'expired')
  assert.equal(state.showUpgradeButton, true)
})

test('a covered dunning failure keeps its payment-issue copy while entitled', () => {
  const state = getMembershipState(
    visitor({ subscriptionStatus: 'past_due', dunningGraceUntil: inDays(3) }),
    true
  )

  assert.equal(state.type, 'payment_issue')
  assert.equal(state.showCancelButton, true)
})

test('a signed-out visitor is unchanged', () => {
  assert.equal(getMembershipState(null, false).type, 'free')
  assert.equal(getMembershipState(null, false).showUpgradeButton, true)
  assert.equal(getBillingInfo(null, false), null)
})

test('a free visitor is offered an upgrade rather than a pause notice', () => {
  const state = getMembershipState(visitor({ subscriptionStatus: 'none' }), false)

  assert.equal(state.type, 'free')
  assert.equal(state.showUpgradeButton, true)
})

// Pre-existing rule, kept: never sell a membership to someone who already has
// access, whichever status produced the state.
test('an entitled visitor is never offered an upgrade', () => {
  const state = getMembershipState(
    visitor({ subscriptionStatus: 'cancelled', membershipExpiration: inDays(-1) }),
    true
  )

  assert.equal(state.showUpgradeButton, false)
  assert.match(state.description, /rejoin once it ends/)
})
