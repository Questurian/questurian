import { describe, expect, it } from 'vitest'

import {
  MAX_CONCURRENT_DOCUMENT_READS,
  readWithBoundedConcurrency,
} from './bounded-reads'

describe('readWithBoundedConcurrency', () => {
  // Slots are numbered, invalidItems reports them by number, and layouts place
  // cards by position. A faster read must never reorder a curated page.
  it('returns results in the order they were asked for, not the order they finish', async () => {
    const delays = [40, 5, 30, 1, 20]
    const results = await readWithBoundedConcurrency(
      delays,
      async (delay, index) => {
        await new Promise((resolve) => setTimeout(resolve, delay))
        return index
      },
      2,
    )

    expect(results).toEqual([0, 1, 2, 3, 4])
  })

  it('never exceeds the limit', async () => {
    let active = 0
    let peak = 0

    await readWithBoundedConcurrency(
      Array.from({ length: 30 }, (_, index) => index),
      async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 2))
        active -= 1
      },
      4,
    )

    expect(peak).toBe(4)
  })

  it('does not start more workers than there is work', async () => {
    let started = 0

    await readWithBoundedConcurrency(
      [1, 2],
      async (value) => {
        started += 1
        return value
      },
      10,
    )

    expect(started).toBe(2)
  })

  it('handles an empty list without starting anything', async () => {
    const results = await readWithBoundedConcurrency([], async () => 'never', 4)
    expect(results).toEqual([])
  })

  // The pool is 20 connections for the whole server and a populated read holds
  // one while it fans out. A page assembly that claimed most of the pool would
  // starve every other request on the box.
  it('keeps the default well inside the connection pool', () => {
    expect(MAX_CONCURRENT_DOCUMENT_READS).toBeGreaterThan(1)
    expect(MAX_CONCURRENT_DOCUMENT_READS).toBeLessThanOrEqual(8)
  })
})
