import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStagedId } from './create-staged-id'

afterEach(() => {
  vi.useRealTimers()
})

describe('createStagedId', () => {
  it('keeps ids unique when the clock does not move', () => {
    // The original `block_${Date.now()}` collided here: adding two blocks in
    // one millisecond produced the same id twice.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T00:00:00.000Z'))

    const ids = Array.from({ length: 1000 }, () => createStagedId('block'))

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps ids from different prefixes apart', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T00:00:00.000Z'))

    const block = createStagedId('block')
    const media = createStagedId('media')

    expect(block.startsWith('block_')).toBe(true)
    expect(media.startsWith('media_')).toBe(true)
    expect(block).not.toBe(media)
  })

  it('cannot collide with the markdown parser\'s positional ids', () => {
    // parseMarkdownToBlocks emits block_0, block_1, ... for a freshly parsed
    // article; a generated id must never land on one of those.
    const id = createStagedId('block')
    expect(id).not.toMatch(/^block_\d+$/)
  })
})
