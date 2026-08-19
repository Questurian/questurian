import { describe, expect, it, vi } from 'vitest'

import {
  applyPlan,
  applyPlannedUpdate,
  diffProfileAgainst,
  type ApplyDeps,
  type PlannedUpdate,
  type ProfileSnapshot,
} from './reconcile-apply'

/**
 * These tests exist for one property: the nightly plan must never be written as
 * read. The scan takes minutes and webhooks keep arriving during it, so a plan
 * applied verbatim is the *older* reading winning by writing last — which is
 * how a refunded visitor gets access back and a fresh member gets locked out.
 *
 * So the scenarios below are written as timelines: the plan says one thing, the
 * world moved, and the assertion is about what actually reaches the database.
 */

const PAID_STATE = {
  subscriptionStatus: 'active' as const,
  cancelAtPeriodEnd: false,
  paidThroughAt: '2026-03-01T00:00:00.000Z',
  dunningGraceUntil: null,
}

const REVOKED_STATE = {
  subscriptionStatus: 'active' as const,
  cancelAtPeriodEnd: false,
  paidThroughAt: null,
  dunningGraceUntil: null,
}

function profile(overrides: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
  return {
    id: 'p1',
    updatedAt: '2026-02-19T04:22:00.000Z',
    authUserId: 'auth-1',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    subscriptionStatus: 'active',
    cancelAtPeriodEnd: false,
    paidThroughAt: '2026-03-01T00:00:00.000Z',
    dunningGraceUntil: null,
    ...overrides,
  }
}

function plan(overrides: Partial<PlannedUpdate> = {}): PlannedUpdate {
  return {
    profileId: 'p1',
    email: 'visitor@example.com',
    changes: { paidThroughAt: '2026-03-01T00:00:00.000Z' },
    reason: 'DRIFTED',
    customerId: 'cus_1',
    subscriptionId: 'sub_1',
    updatedAt: '2026-02-19T04:22:00.000Z',
    ...overrides,
  }
}

function deps(overrides: Partial<ApplyDeps> = {}) {
  const writeProfile = vi.fn(async () => {})
  const locked: string[] = []

  const base: ApplyDeps = {
    readProfile: async () => profile(),
    readDesired: async () => ({
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      state: PAID_STATE,
    }),
    writeProfile,
    withLock: async (key, work) => {
      locked.push(key)
      return work()
    },
    emit: () => {},
    ...overrides,
  }

  return { deps: base, writeProfile: base.writeProfile as typeof writeProfile, locked }
}

describe('diffProfileAgainst', () => {
  it('returns only the fields that actually differ', () => {
    const changes = diffProfileAgainst(profile({ paidThroughAt: null }), {
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      state: PAID_STATE,
    })

    expect(changes).toEqual({ paidThroughAt: '2026-03-01T00:00:00.000Z' })
  })

  it('fills a lost customer linkage without touching subscription state', () => {
    const changes = diffProfileAgainst(profile({ stripeCustomerId: null }), {
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      state: PAID_STATE,
    })

    expect(changes).toEqual({ stripeCustomerId: 'cus_1' })
  })

  it('writes nothing when the profile already matches Stripe', () => {
    expect(
      diffProfileAgainst(profile(), {
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        state: PAID_STATE,
      })
    ).toEqual({})
  })

  it('leaves subscription fields alone when the customer has no subscription', () => {
    const changes = diffProfileAgainst(profile({ stripeCustomerId: null }), {
      customerId: 'cus_1',
      subscriptionId: null,
      state: null,
    })

    expect(changes).toEqual({ stripeCustomerId: 'cus_1' })
  })
})

describe('applyPlannedUpdate', () => {
  it('serialises on the same key the webhook resync uses', async () => {
    const { deps: d, locked } = deps({
      readProfile: async () => profile({ paidThroughAt: null }),
    })

    await applyPlannedUpdate(plan(), d)

    expect(locked).toEqual(['stripe:subscription:sub_1'])
  })

  it('writes what Stripe says now, not what the scan planned', async () => {
    // 04:22 scan saw paid-through Mar 1. 04:31 a refund revoked access. The
    // plan still says Mar 1; only the fresh read may decide.
    const { deps: d, writeProfile } = deps({
      readProfile: async () => profile({ paidThroughAt: null }),
      readDesired: async () => ({
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        state: REVOKED_STATE,
      }),
    })

    const outcome = await applyPlannedUpdate(
      plan({ changes: { paidThroughAt: '2026-03-01T00:00:00.000Z' } }),
      d
    )

    expect(outcome).toBe('noop')
    expect(writeProfile).not.toHaveBeenCalled()
  })

  it('abandons a row the refund webhook already rewrote', async () => {
    const { deps: d, writeProfile } = deps({
      // The revocation handler wrote at 04:31, moving `updatedAt`.
      readProfile: async () =>
        profile({ paidThroughAt: null, updatedAt: '2026-02-19T04:31:00.000Z' }),
    })

    const outcome = await applyPlannedUpdate(plan(), d)

    expect(outcome).toBe('stale')
    expect(writeProfile).not.toHaveBeenCalled()
  })

  it('abandons a row whose owning subscription changed mid-scan', async () => {
    // Visitor checked out at 04:25; the new subscription owns the row now, and
    // the webhook has already written it.
    const { deps: d, writeProfile } = deps({
      readProfile: async () => profile({ stripeSubscriptionId: 'sub_2' }),
      readDesired: async () => ({
        customerId: 'cus_1',
        subscriptionId: 'sub_2',
        state: PAID_STATE,
      }),
    })

    const outcome = await applyPlannedUpdate(plan({ subscriptionId: 'sub_1' }), d)

    expect(outcome).toBe('stale')
    expect(writeProfile).not.toHaveBeenCalled()
  })

  it('treats an unknown updatedAt as movement rather than as agreement', async () => {
    const { deps: d, writeProfile } = deps({
      readProfile: async () => profile({ updatedAt: null }),
    })

    expect(await applyPlannedUpdate(plan(), d)).toBe('stale')
    expect(writeProfile).not.toHaveBeenCalled()
  })

  it('applies a genuine divergence that survived both re-reads', async () => {
    const { deps: d, writeProfile } = deps({
      readProfile: async () => profile({ paidThroughAt: null }),
    })

    expect(await applyPlannedUpdate(plan(), d)).toBe('applied')
    expect(writeProfile).toHaveBeenCalledWith('p1', {
      paidThroughAt: '2026-03-01T00:00:00.000Z',
    })
  })

  it('runs a linkage-only row unlocked, guarded by the timestamp alone', async () => {
    const { deps: d, writeProfile, locked } = deps({
      readProfile: async () => profile({ stripeCustomerId: null, stripeSubscriptionId: null }),
      readDesired: async () => ({ customerId: 'cus_1', subscriptionId: null, state: null }),
    })

    const outcome = await applyPlannedUpdate(
      plan({ reason: 'RELINKABLE', subscriptionId: null, changes: { stripeCustomerId: 'cus_1' } }),
      d
    )

    expect(outcome).toBe('applied')
    expect(locked).toEqual([])
    expect(writeProfile).toHaveBeenCalledWith('p1', { stripeCustomerId: 'cus_1' })
  })

  it('skips a profile deleted between the scan and the write', async () => {
    const { deps: d, writeProfile } = deps({ readProfile: async () => null })

    expect(await applyPlannedUpdate(plan(), d)).toBe('missing')
    expect(writeProfile).not.toHaveBeenCalled()
  })

  it('skips a customer that no longer resolves to this profile', async () => {
    const { deps: d, writeProfile } = deps({ readDesired: async () => null })

    expect(await applyPlannedUpdate(plan(), d)).toBe('missing')
    expect(writeProfile).not.toHaveBeenCalled()
  })

  it('reports a failed row instead of throwing out of the pass', async () => {
    const emit = vi.fn()
    const { deps: d } = deps({
      readProfile: async () => profile({ paidThroughAt: null }),
      writeProfile: async () => {
        throw new Error('connection terminated')
      },
      emit,
    })

    expect(await applyPlannedUpdate(plan(), d)).toBe('failed')
    expect(emit.mock.calls.flat().join('\n')).toContain('connection terminated')
  })
})

describe('applyPlan', () => {
  it('keeps going after a failure and tallies every outcome', async () => {
    const seen: Array<string | number> = []
    const { deps: d } = deps({
      readProfile: async (id) => {
        seen.push(id)
        if (id === 'gone') return null
        if (id === 'moved') return profile({ id, updatedAt: '2026-02-19T04:31:00.000Z' })
        return profile({ id, paidThroughAt: null })
      },
      writeProfile: async (id) => {
        if (id === 'bad') throw new Error('nope')
      },
    })

    const summary = await applyPlan(
      [
        plan({ profileId: 'ok' }),
        plan({ profileId: 'gone' }),
        plan({ profileId: 'moved' }),
        plan({ profileId: 'bad' }),
      ],
      d
    )

    expect(summary).toEqual({ applied: 1, stale: 1, noop: 0, missing: 1, failed: 1 })
    expect(seen).toEqual(['ok', 'gone', 'moved', 'bad'])
  })
})
