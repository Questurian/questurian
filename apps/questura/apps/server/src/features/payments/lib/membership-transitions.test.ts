/**
 * Unit coverage for the transition resolver.
 *
 * The end-to-end simulation drives whole webhook sequences; this file pins the
 * decision itself, including the before-states that are awkward to reach
 * through the route — above all the `past_due` fork, where one internal status
 * covers both a failed renewal and a first charge that never cleared.
 */
import { describe, expect, it } from 'vitest'
import {
  resolveMembershipTransitions,
  type MembershipSnapshot,
} from './membership-transitions'
import type { DerivedSubscriptionState } from './subscription-state'

const DAY_MS = 24 * 60 * 60 * 1000
const future = (days = 20) => new Date(Date.now() + days * DAY_MS).toISOString()
const past = (days = 20) => new Date(Date.now() - days * DAY_MS).toISOString()

function state(over: Partial<DerivedSubscriptionState> = {}): DerivedSubscriptionState {
  return {
    subscriptionStatus: 'active',
    cancelAtPeriodEnd: false,
    paidThroughAt: future(),
    dunningGraceUntil: null,
    ...over,
  }
}

function kinds(before: MembershipSnapshot, after: DerivedSubscriptionState) {
  return resolveMembershipTransitions(before, after).map((t) => t.kind)
}

const NEW_VISITOR: MembershipSnapshot = {
  subscriptionStatus: 'none',
  cancelAtPeriodEnd: false,
  paidThroughAt: null,
  dunningGraceUntil: null,
}

/**
 * What `customer.subscription.created` writes for a subscription still waiting
 * on 3DS: `incomplete` maps to internal `past_due`, and `paidThroughAt` is the
 * start of a period nobody has paid for yet, so it is already in the past. No
 * grace opens, because nothing ever collected.
 */
const AWAITING_3DS: MembershipSnapshot = {
  subscriptionStatus: 'past_due',
  cancelAtPeriodEnd: false,
  paidThroughAt: past(0.001),
  dunningGraceUntil: null,
}

/** A member whose renewal charge failed: paid time behind them, grace running. */
const DUNNING: MembershipSnapshot = {
  subscriptionStatus: 'past_due',
  cancelAtPeriodEnd: false,
  paidThroughAt: past(0.001),
  dunningGraceUntil: future(5),
}

const ACTIVE_MEMBER: MembershipSnapshot = {
  subscriptionStatus: 'active',
  cancelAtPeriodEnd: false,
  paidThroughAt: future(),
  dunningGraceUntil: null,
}

describe('membership_started', () => {
  it('welcomes a first-time buyer', () => {
    expect(kinds(NEW_VISITOR, state())).toEqual(['membership_started'])
  })

  it('welcomes a 3DS buyer whose first charge only cleared on the second event', () => {
    // The bug: `incomplete` and a failed renewal share one internal status, so
    // this read as dunning recovery and the buyer heard nothing at all.
    expect(kinds(AWAITING_3DS, state())).toEqual(['membership_started'])
  })

  it('stays silent when a failed renewal recovers', () => {
    expect(kinds(DUNNING, state())).toEqual([])
  })

  it('stays silent when dunning recovers after the grace already lapsed', () => {
    // Access may have blinked out, but the membership itself never restarted.
    expect(kinds({ ...DUNNING, dunningGraceUntil: past(1) }, state())).toEqual([])
  })

  it('does not re-welcome an active member on a redelivered event', () => {
    expect(kinds(ACTIVE_MEMBER, state())).toEqual([])
  })

  it('does not welcome a revoked member whose subscription is still active', () => {
    // A refund nulls `paidThroughAt` while Stripe still reports `active`; the
    // next update must not read as a fresh signup.
    expect(kinds({ ...ACTIVE_MEMBER, paidThroughAt: null }, state({ paidThroughAt: null })))
      .toEqual([])
  })

  it('welcomes someone who subscribes again after their membership ended', () => {
    const ended: MembershipSnapshot = {
      subscriptionStatus: 'cancelled',
      cancelAtPeriodEnd: false,
      paidThroughAt: past(3),
      dunningGraceUntil: null,
    }
    expect(kinds(ended, state())).toEqual(['membership_started'])
  })

  it('says nothing while the payment is still outstanding', () => {
    expect(kinds(NEW_VISITOR, state({ subscriptionStatus: 'past_due', paidThroughAt: past(0.001) })))
      .toEqual([])
  })
})

describe('cancellation and reactivation', () => {
  it('announces a scheduled cancellation once', () => {
    const after = state({ cancelAtPeriodEnd: true })
    expect(kinds(ACTIVE_MEMBER, after)).toEqual(['cancellation_scheduled'])

    const [transition] = resolveMembershipTransitions(ACTIVE_MEMBER, after)
    expect(transition).toEqual({ kind: 'cancellation_scheduled', endsAt: after.paidThroughAt })

    const cancelling = { ...ACTIVE_MEMBER, cancelAtPeriodEnd: true }
    expect(kinds(cancelling, after)).toEqual([])
  })

  it('announces a reactivation once', () => {
    const cancelling = { ...ACTIVE_MEMBER, cancelAtPeriodEnd: true }
    expect(kinds(cancelling, state())).toEqual(['reactivated'])
    expect(kinds(ACTIVE_MEMBER, state())).toEqual([])
  })

  it('welcomes and schedules together when a signup arrives already cancelling', () => {
    expect(kinds(NEW_VISITOR, state({ cancelAtPeriodEnd: true })))
      .toEqual(['membership_started', 'cancellation_scheduled'])
  })
})

describe('membership_ended', () => {
  it('announces an unannounced ending', () => {
    const after = state({ subscriptionStatus: 'cancelled', paidThroughAt: past(0.001) })
    expect(resolveMembershipTransitions(ACTIVE_MEMBER, after))
      .toEqual([{ kind: 'membership_ended', wasImmediate: true }])
  })

  it('stays silent when an abandoned 3DS attempt expires', () => {
    // `incomplete_expired` maps to `cancelled` just like a real ending does.
    // Nobody was ever let in, so there is nothing to say goodbye to.
    expect(kinds(AWAITING_3DS, state({ subscriptionStatus: 'cancelled', paidThroughAt: past(0.001) })))
      .toEqual([])
  })

  it('announces the ending of a dunning subscription Stripe gave up on', () => {
    // The grace is long expired by the time Stripe stops retrying, but it is
    // still on the profile, and it is the proof this membership was real.
    const exhausted = { ...DUNNING, dunningGraceUntil: past(20) }
    expect(kinds(exhausted, state({ subscriptionStatus: 'cancelled', paidThroughAt: past(0.001) })))
      .toEqual(['membership_ended'])
  })

  it('announces the ending of a refunded member whose access is already revoked', () => {
    // A refund nulls `paidThroughAt` and then cancels the subscription, so the
    // ending arrives against a member with no paid time left. They were a
    // member, and the cancellation is still theirs to hear about.
    const refunded = { ...ACTIVE_MEMBER, paidThroughAt: null }
    expect(kinds(refunded, state({ subscriptionStatus: 'cancelled', paidThroughAt: null })))
      .toEqual(['membership_ended'])
  })

  it('announces an ending for paid-up access even where the status lags', () => {
    const paidUp: MembershipSnapshot = {
      subscriptionStatus: 'none',
      cancelAtPeriodEnd: false,
      paidThroughAt: future(),
      dunningGraceUntil: null,
    }
    expect(kinds(paidUp, state({ subscriptionStatus: 'cancelled', paidThroughAt: null })))
      .toEqual(['membership_ended'])
  })

  it('stays silent when a visitor who never subscribed sees a cancelled subscription', () => {
    expect(kinds(NEW_VISITOR, state({ subscriptionStatus: 'cancelled', paidThroughAt: null })))
      .toEqual([])
  })

  it('reports an ending with paid time left as not immediate', () => {
    const after = state({ subscriptionStatus: 'cancelled', paidThroughAt: future(5) })
    expect(resolveMembershipTransitions(ACTIVE_MEMBER, after))
      .toEqual([{ kind: 'membership_ended', wasImmediate: false }])
  })

  it('stays silent when the visitor already scheduled the ending', () => {
    const cancelling = { ...ACTIVE_MEMBER, cancelAtPeriodEnd: true }
    expect(kinds(cancelling, state({ subscriptionStatus: 'cancelled', paidThroughAt: past(0.001) })))
      .toEqual([])
  })

  it('stays silent on a redelivered ending', () => {
    const ended: MembershipSnapshot = {
      subscriptionStatus: 'cancelled',
      cancelAtPeriodEnd: false,
      paidThroughAt: past(0.001),
      dunningGraceUntil: null,
    }
    expect(kinds(ended, state({ subscriptionStatus: 'cancelled', paidThroughAt: past(0.001) })))
      .toEqual([])
  })
})

describe('missing fields', () => {
  it('treats an empty snapshot as a visitor who has never subscribed', () => {
    expect(kinds({}, state())).toEqual(['membership_started'])
  })
})
