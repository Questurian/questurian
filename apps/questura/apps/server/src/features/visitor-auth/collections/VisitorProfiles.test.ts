import { describe, expect, it, vi } from 'vitest'

import type { Field } from 'payload'

import { logger } from '@/shared/utils/logger'

import { VisitorProfiles } from './VisitorProfiles'
import { logMembershipFieldEdits } from './hooks/logMembershipFieldEdits'
import { preventVisitorProfileDelete } from './hooks/preventDelete'

const access = VisitorProfiles.access as Record<
  string,
  (args: { req: { user: unknown } }) => boolean
>

describe('VisitorProfiles deletion', () => {
  it.each([
    ['admin', { id: 1, collection: 'users', role: 'admin' }],
    ['editor', { id: 2, collection: 'users', role: 'editor' }],
    ['writer', { id: 3, collection: 'users', role: 'writer' }],
    ['service account', { id: 4, collection: 'service-accounts', name: 'Location Manager' }],
    ['anonymous caller', null],
  ])('refuses deletion by %s', (_label, user) => {
    expect(access.delete({ req: { user } })).toBe(false)
  })

  it('wires the deletion invariant into the collection lifecycle', () => {
    expect(VisitorProfiles.hooks?.beforeDelete).toContain(preventVisitorProfileDelete)
  })

  it('refuses trusted Local API deletion that bypasses collection access', () => {
    expect(() =>
      (preventVisitorProfileDelete as (args: unknown) => unknown)({
        id: 42,
        req: {},
      }),
    ).toThrow('Visitor profiles cannot be deleted independently.')
  })
})

/** Every named field, flattened out of rows and collapsibles. */
function namedFields(fields: Field[]): Map<string, Field> {
  const found = new Map<string, Field>()

  for (const field of fields) {
    if ('name' in field && field.name) found.set(field.name, field)
    if ('fields' in field && Array.isArray(field.fields)) {
      for (const [name, nested] of namedFields(field.fields)) found.set(name, nested)
    }
  }

  return found
}

const fields = namedFields(VisitorProfiles.fields)

/** `UIField` carries no `access`, and none of these fields is one. */
const fieldAccess = (field: Field | undefined) =>
  (field as { access?: { update?: unknown } } | undefined)?.access

const fieldUpdate = (name: string) => {
  const field = fields.get(name)
  if (!field) throw new Error(`No field named ${name} on visitor-profiles`)
  const update = fieldAccess(field)?.update
  if (!update) throw new Error(`Field ${name} has no update access rule`)
  return (user: unknown) =>
    Boolean((update as (args: { req: { user: unknown } }) => unknown)({ req: { user } }))
}

describe('VisitorProfiles membership fields', () => {
  const MEMBERSHIP_FIELDS = [
    'authUserId',
    'billingEmail',
    'subscriptionStatus',
    'paidThroughAt',
    'dunningGraceUntil',
    'cancelAtPeriodEnd',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'affiliateReferralId',
    'affiliateReferredAt',
  ]

  // Entitlement is a future `paidThroughAt` and nothing else, so write access
  // to these fields is write access to the paywall.
  it.each(MEMBERSHIP_FIELDS)('refuses %s to an editor', (name) => {
    expect(fieldUpdate(name)({ id: 2, collection: 'users', role: 'editor', status: 'active' })).toBe(
      false,
    )
  })

  it.each(MEMBERSHIP_FIELDS)('refuses %s to a writer', (name) => {
    expect(fieldUpdate(name)({ id: 3, collection: 'users', role: 'writer', status: 'active' })).toBe(
      false,
    )
  })

  it.each(MEMBERSHIP_FIELDS)('refuses %s to a disabled admin', (name) => {
    expect(
      fieldUpdate(name)({ id: 4, collection: 'users', role: 'admin', status: 'disabled' }),
    ).toBe(false)
  })

  it.each(MEMBERSHIP_FIELDS)('allows %s to an active admin', (name) => {
    expect(fieldUpdate(name)({ id: 1, collection: 'users', role: 'admin', status: 'active' })).toBe(
      true,
    )
  })

  // Editors keep the collection so support corrections do not need an admin.
  it('still lets an editor update the profile itself', () => {
    expect(access.update({ req: { user: { id: 2, collection: 'users', role: 'editor' } } })).toBe(
      true,
    )
  })

  it('leaves support fields editable', () => {
    for (const name of ['email', 'firstName', 'lastName']) {
      expect(fieldAccess(fields.get(name))?.update).toBeUndefined()
    }
  })
})

describe('membership edit audit trail', () => {
  const run = (args: Record<string, unknown>) =>
    (logMembershipFieldEdits as (a: unknown) => unknown)(args)

  it('is wired into the collection lifecycle', () => {
    expect(VisitorProfiles.hooks?.afterChange).toContain(logMembershipFieldEdits)
  })

  it('logs a hand-granted membership', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never)

    run({
      operation: 'update',
      doc: { id: 7, paidThroughAt: '2030-01-01T00:00:00.000Z', subscriptionStatus: 'active' },
      previousDoc: { id: 7, paidThroughAt: null, subscriptionStatus: 'none' },
      req: { user: { id: 2, collection: 'users', role: 'editor' } },
    })

    expect(warn).toHaveBeenCalledWith(
      'Membership fields changed by a staff account',
      expect.objectContaining({
        profileId: 7,
        actorId: 2,
        changedFields: ['subscriptionStatus', 'paidThroughAt'],
      }),
    )

    warn.mockRestore()
  })

  it('stays quiet for support edits that touch no membership field', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never)

    run({
      operation: 'update',
      doc: { id: 7, firstName: 'Ada', paidThroughAt: '2030-01-01T00:00:00.000Z' },
      previousDoc: { id: 7, firstName: 'A', paidThroughAt: '2030-01-01T00:00:00.000Z' },
      req: { user: { id: 2, collection: 'users' } },
    })

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  // Stripe resync, checkout and the reconciler all write through the Local API
  // with no `req.user`, and log their own writes.
  it('stays quiet for machine writes', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never)

    run({
      operation: 'update',
      doc: { id: 7, paidThroughAt: '2030-01-01T00:00:00.000Z' },
      previousDoc: { id: 7, paidThroughAt: null },
      req: {},
    })

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  // A `Date` from one write path and an ISO string from another are the same
  // instant; a false positive every renewal makes the log unreadable.
  it('does not report an unchanged date written in a different shape', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never)

    run({
      operation: 'update',
      doc: { id: 7, paidThroughAt: '2030-01-01T00:00:00.000Z' },
      previousDoc: { id: 7, paidThroughAt: new Date('2030-01-01T00:00:00.000Z') },
      req: { user: { id: 1, collection: 'users' } },
    })

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
