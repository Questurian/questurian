import { describe, expect, it } from 'vitest'

import { reorderBlocksByIds } from './reorder-blocks'

describe('reorderBlocksByIds', () => {
  const blocks = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }]

  it('reorders by id list', () => {
    const result = reorderBlocksByIds(blocks, ['c', 'a', 'b'])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reordered.map((b) => b.id)).toEqual(['c', 'a', 'b'])
    }
  })

  it('rejects duplicate ids', () => {
    const result = reorderBlocksByIds(blocks, ['a', 'a', 'b'])
    expect(result.ok).toBe(false)
  })

  it('rejects unknown id', () => {
    const result = reorderBlocksByIds(blocks, ['a', 'b', 'z'])
    expect(result.ok).toBe(false)
  })

  it('allows empty when no blocks', () => {
    const result = reorderBlocksByIds([], [])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reordered).toEqual([])
  })
})
