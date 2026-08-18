import { describe, expect, it } from 'vitest'

import { normalizeAuthUserId, resolveReconcileTarget } from './reconcile-ownership'

/**
 * These tests exist because the nightly reconciliation used to link a Stripe
 * customer to a profile on a shared email alone — unattended, apply on by
 * default — and the same write copied the payer's subscription onto whoever
 * happened to hold that address. The rule below is what stops that, so the case
 * that used to be adopted is the one asserted hardest.
 */

const PAYER = { id: 1, authUserId: 'auth-payer' }
const STRANGER = { id: 2, authUserId: 'auth-stranger' }

describe('resolveReconcileTarget', () => {
  it('repairs lost linkage when the customer names an owner that still exists', () => {
    expect(
      resolveReconcileTarget({
        customerOwnerAuthUserId: 'auth-payer',
        linkedProfile: null,
        ownedProfile: PAYER,
        emailCandidateCount: 1,
      })
    ).toEqual({ kind: 'update', profile: PAYER })
  })

  it('refuses an email-only match, however unambiguous', () => {
    expect(
      resolveReconcileTarget({
        customerOwnerAuthUserId: null,
        linkedProfile: null,
        ownedProfile: null,
        emailCandidateCount: 1,
      })
    ).toEqual({ kind: 'unproven' })
  })

  it('refuses an email match even when the customer names some other owner', () => {
    // The destroyed-profile case: the payer's account is gone, and a stranger
    // now holds the address the customer was created with.
    expect(
      resolveReconcileTarget({
        customerOwnerAuthUserId: 'auth-payer',
        linkedProfile: null,
        ownedProfile: null,
        emailCandidateCount: 1,
      })
    ).toEqual({ kind: 'unproven' })
  })

  it('treats blank metadata as no claim of ownership', () => {
    expect(
      resolveReconcileTarget({
        customerOwnerAuthUserId: '   ',
        linkedProfile: null,
        ownedProfile: PAYER,
        emailCandidateCount: 1,
      })
    ).toEqual({ kind: 'unproven' })
  })

  it('reports nothing to do when no profile carries the email either', () => {
    expect(
      resolveReconcileTarget({
        customerOwnerAuthUserId: null,
        linkedProfile: null,
        ownedProfile: null,
        emailCandidateCount: 0,
      })
    ).toEqual({ kind: 'none' })
  })

  it('keeps healing drift on an existing linkage', () => {
    expect(
      resolveReconcileTarget({
        customerOwnerAuthUserId: 'auth-payer',
        linkedProfile: PAYER,
        ownedProfile: PAYER,
        emailCandidateCount: 1,
      })
    ).toEqual({ kind: 'update', profile: PAYER })
  })

  it('still heals drift on a legacy customer that names nobody', () => {
    // Ownership was proven once, at checkout, by whatever wrote the linkage.
    expect(
      resolveReconcileTarget({
        customerOwnerAuthUserId: null,
        linkedProfile: PAYER,
        ownedProfile: null,
        emailCandidateCount: 1,
      })
    ).toEqual({ kind: 'update', profile: PAYER })
  })

  it('will not write to a linked profile Stripe says belongs to someone else', () => {
    expect(
      resolveReconcileTarget({
        customerOwnerAuthUserId: 'auth-payer',
        linkedProfile: STRANGER,
        ownedProfile: PAYER,
        emailCandidateCount: 1,
      })
    ).toEqual({ kind: 'mismatched', profile: STRANGER })
  })
})

describe('normalizeAuthUserId', () => {
  it('collapses absent, empty and whitespace ids to null', () => {
    expect(normalizeAuthUserId(undefined)).toBeNull()
    expect(normalizeAuthUserId(null)).toBeNull()
    expect(normalizeAuthUserId('')).toBeNull()
    expect(normalizeAuthUserId('  ')).toBeNull()
  })

  it('trims a real id rather than rejecting it', () => {
    expect(normalizeAuthUserId(' auth-payer ')).toBe('auth-payer')
  })
})
