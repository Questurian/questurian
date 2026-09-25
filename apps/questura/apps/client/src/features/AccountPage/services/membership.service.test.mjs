import assert from 'node:assert/strict'
import test from 'node:test'

import { getBillingInfo, getMembershipLinks, getMembershipState } from './membership.service.ts'

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
  const billing = getBillingInfo({ ...user, billingInterval: 'month' }, true)
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

// Launch fix plan item 11. Once the grace runs out, Stripe is still retrying the
// same subscription, and checkout refuses a second one while it lives (a
// past_due subscription counts as live). Upgrade was a button that could only
// answer 400; the portal is where the card gets fixed.
test('a lapsed dunning failure is sent to the billing portal, not to checkout', () => {
  const state = getMembershipState(
    visitor({ subscriptionStatus: 'past_due', dunningGraceUntil: inDays(-1) }),
    false
  )

  assert.equal(state.type, 'expired')
  assert.equal(state.showUpgradeButton, false)
  assert.deepEqual(getMembershipLinks(state, getBillingInfo(visitor({ subscriptionStatus: 'past_due' }), false), false), {
    showActionLinks: true,
    canUpdatePayment: true,
  })
})

// `incomplete` also reads `past_due`, but it never collected and never opened a
// grace. Checkout does not count it as live, so buying again is the way out.
test('a checkout that never completed keeps its upgrade path', () => {
  const state = getMembershipState(visitor({ subscriptionStatus: 'past_due', dunningGraceUntil: null }), false)

  assert.equal(state.showUpgradeButton, true)
})

// Launch fix plan item 11: the payment-issue card told the visitor to "update
// your payment method" and then showed no link to do it, because the links
// hung off the billing summary and that only exists for an `active` status.
test('a covered dunning failure shows the Update Payment Method link', () => {
  const user = visitor({ subscriptionStatus: 'past_due', dunningGraceUntil: inDays(3) })
  const state = getMembershipState(user, true)

  assert.deepEqual(getMembershipLinks(state, getBillingInfo(user, true), true), {
    showActionLinks: true,
    canUpdatePayment: true,
  })
})

// D5 (launch fix plan): Questura never offers pausing, so a paused subscription
// grants nothing, and it still blocks a second checkout. The card must not sell
// one; the portal is where it is managed.
test('a paused subscription is shown as paused, with the portal and no upgrade', () => {
  const user = visitor({ subscriptionStatus: 'paused' })
  const state = getMembershipState(user, false)

  assert.equal(state.type, 'paused')
  assert.equal(state.showUpgradeButton, false)
  assert.match(state.description, /paused/i)
  assert.deepEqual(getMembershipLinks(state, getBillingInfo(user, false), false), {
    showActionLinks: true,
    canUpdatePayment: true,
  })
})

// Launch fix plan item 11: the billing period was the literal 'Monthly'.
test('the billing period is the one the member actually pays', () => {
  const renews = inDays(200)

  assert.equal(getBillingInfo(visitor({ subscriptionRenewsAt: renews, billingInterval: 'year' }), true)?.billingPeriod, 'Yearly')
  assert.equal(getBillingInfo(visitor({ subscriptionRenewsAt: renews, billingInterval: 'month' }), true)?.billingPeriod, 'Monthly')
  // Not known yet (a profile no webhook has touched since the field existed):
  // say nothing rather than guess.
  assert.equal(getBillingInfo(visitor({ subscriptionRenewsAt: renews, billingInterval: null }), true)?.billingPeriod, null)
})

test('a free visitor gets no billing links', () => {
  const state = getMembershipState(visitor({ subscriptionStatus: 'none' }), false)

  assert.deepEqual(getMembershipLinks(state, null, false), { showActionLinks: false, canUpdatePayment: false })
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

// Half an hour before midnight UTC is already the next day east of it. The card
// writes access dates in UTC whatever zone renders it (the tests run under
// TZ=UTC and TZ=Pacific/Kiritimati), so the server's HTML, the browser's first
// render and the emails all name the same day.
const LATE_UTC = '2099-01-31T23:30:00.000Z'

test('every date on the membership card is the UTC day, month spelled out', () => {
  const cases = [
    [visitor({ subscriptionRenewsAt: LATE_UTC }), 'renews on January 31, 2099.'],
    [
      visitor({ cancelAtPeriodEnd: true, membershipExpiration: LATE_UTC }),
      'will expire on January 31, 2099.',
    ],
    [
      visitor({ subscriptionStatus: 'past_due', dunningGraceUntil: LATE_UTC }),
      'continues until January 31, 2099 while',
    ],
    [
      visitor({ subscriptionStatus: 'cancelled', membershipExpiration: LATE_UTC }),
      'remains active until January 31, 2099.',
    ],
    [
      visitor({ subscriptionStatus: 'cancelled', membershipExpiration: '2001-01-31T23:30:00.000Z' }),
      'expired on January 31, 2001.',
    ],
  ]

  for (const [user, expected] of cases) {
    const { description } = getMembershipState(user, true)
    assert.ok(description.includes(expected), `${description} should include "${expected}"`)
  }
  assert.equal(
    getBillingInfo(visitor({ subscriptionRenewsAt: LATE_UTC }), true)?.nextBilling,
    'January 31, 2099'
  )
})
