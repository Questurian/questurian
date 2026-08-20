import assert from 'node:assert/strict'
import test from 'node:test'

import { describeLock, isLocked, readGate } from './gate.ts'

/**
 * The client half of the paywall (ADR-0009).
 *
 * The server decides what to withhold and does the withholding; this module
 * decides what the reader is *told* about it. It had no tests, which mattered
 * because it is the layer standing between a paying member and the content they
 * bought — a branch inverted here is invisible to every server test.
 *
 * The safety property worth stating once: the locked body is never in the
 * payload this reads. `readGate` returning null on a malformed `gate` therefore
 * costs the call to action, not the content. There is no input to this module
 * that reveals paid text, which is why the parsing below is allowed to be
 * forgiving.
 */

const gated = (over = {}) => ({
  gate: { access: 'member', locked: true, unit: 'blocks', shown: 2, total: 12, ...over },
})

test('readGate: reads a well-formed gate as sent', () => {
  assert.deepEqual(readGate(gated()), {
    access: 'member',
    locked: true,
    unit: 'blocks',
    shown: 2,
    total: 12,
  })
})

test('readGate: returns null rather than guessing when locked is not a boolean', () => {
  // The one field with no safe default. "Locked" is the whole decision, and a
  // guess in either direction is wrong: false hides the offer from a reader who
  // could buy, true tells a member they cannot read what they already paid for.
  assert.equal(readGate(gated({ locked: 'yes' })), null)
  assert.equal(readGate(gated({ locked: undefined })), null)
})

test('readGate: returns null for payloads that carry no gate at all', () => {
  assert.equal(readGate(null), null)
  assert.equal(readGate(undefined), null)
  assert.equal(readGate('an article'), null)
  assert.equal(readGate({}), null)
  assert.equal(readGate({ gate: null }), null)
  assert.equal(readGate({ gate: 'locked' }), null)
})

test('readGate: an unrecognised access tier reads as free, never as member', () => {
  // Free is the tier that shows no paywall. Inventing `member` from a value the
  // server did not send would put a notice on an item nobody has to pay for.
  assert.equal(readGate(gated({ access: 'premium' })).access, 'free')
  assert.equal(readGate(gated({ access: undefined })).access, 'free')
  assert.equal(readGate(gated({ access: 'member' })).access, 'member')
})

test('readGate: an unrecognised unit reads as blocks', () => {
  assert.equal(readGate(gated({ unit: 'chapters' })).unit, 'blocks')
  assert.equal(readGate(gated({ unit: 'days' })).unit, 'days')
  assert.equal(readGate(gated({ unit: 'items' })).unit, 'items')
})

test('readGate: non-numeric counts read as zero rather than NaN', () => {
  // A NaN reaches the copy as "the first NaN of NaN sections".
  const gate = readGate(gated({ shown: 'two', total: null }))

  assert.equal(gate.shown, 0)
  assert.equal(gate.total, 0)
})

test('isLocked: true only for an explicit locked gate', () => {
  assert.equal(isLocked(gated()), true)
  assert.equal(isLocked(gated({ locked: false })), false)
  assert.equal(isLocked({}), false)
  assert.equal(isLocked(null), false)
})

test('isLocked: a gated item still reads as locked when its sample lost nothing', () => {
  // `locked` is the tier, not the outcome of the cut. An item shorter than its
  // own sample limit is still paid content and still has to render as such.
  assert.equal(isLocked(gated({ shown: 3, total: 3 })), true)
})

test('describeLock: says nothing when the item is not locked', () => {
  const copy = describeLock(readGate(gated({ locked: false })))

  assert.equal(copy.headline, null)
  assert.ok(copy.cta.length > 0)
})

test('describeLock: an itinerary is sold on its length, not on a fraction', () => {
  // Itineraries keep no day at all, so "Day 0 of 5" would read as a bug rather
  // than an offer.
  const copy = describeLock(readGate(gated({ unit: 'days', shown: 0, total: 5 })))

  assert.match(copy.cta, /5 days/)
  assert.ok(copy.headline)
  assert.doesNotMatch(copy.headline, /\b0\b/)
})

test('describeLock: an itinerary with no known day count still offers the unlock', () => {
  const copy = describeLock(readGate(gated({ unit: 'days', shown: 0, total: 0 })))

  assert.equal(copy.cta, 'Unlock the full itinerary')
  assert.doesNotMatch(copy.cta, /0/)
})

test('describeLock: an article names how much of it the reader has', () => {
  const copy = describeLock(readGate(gated({ shown: 2, total: 12 })))

  assert.match(copy.headline, /first 2 of 12/)
})

test('describeLock: no fraction is quoted when it would read as nothing shown', () => {
  // Zero shown, or a total that does not exceed it, produces no honest
  // fraction -- so the copy falls back rather than printing "first 0 of 12".
  for (const gate of [gated({ shown: 0, total: 12 }), gated({ shown: 5, total: 5 })]) {
    const copy = describeLock(readGate(gate))

    assert.equal(copy.headline, null)
    assert.ok(copy.cta.length > 0)
  }
})
