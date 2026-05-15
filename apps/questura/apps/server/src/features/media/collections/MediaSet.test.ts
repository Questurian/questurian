import { describe, expect, it } from 'vitest'

import { MediaSet } from './MediaSet'

const beforeChangeHook = MediaSet.hooks?.beforeChange?.[0]

type HookArgs = Parameters<NonNullable<typeof beforeChangeHook>>[0]

function runBeforeChange(
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
): Record<string, unknown> {
  if (!beforeChangeHook) throw new Error('MediaSet beforeChange hook is unavailable')
  const result = beforeChangeHook({
    data,
    originalDoc,
    req: {},
    operation: 'update',
  } as unknown as HookArgs)
  return result as Record<string, unknown>
}

describe('MediaSet beforeChange status', () => {
  it('marks empty when no variants attached', () => {
    const result = runBeforeChange({ title: 't', variants: {} })
    expect(result.status).toBe('empty')
  })

  it('marks partial when variants exist but thumbnail is missing', () => {
    const result = runBeforeChange({
      title: 't',
      variants: { square: 1, wide: 2 },
    })
    expect(result.status).toBe('partial')
  })

  it('marks usable when thumbnail variant is present', () => {
    const result = runBeforeChange({
      title: 't',
      variants: { thumbnail: 1 },
    })
    expect(result.status).toBe('usable')
  })

  it('preserves original variants when data omits them', () => {
    const result = runBeforeChange(
      { title: 't' },
      { variants: { thumbnail: 5 } },
    )
    expect(result.status).toBe('usable')
  })

  it('does not mark usable based on legacy "complete" idea (full set without thumbnail)', () => {
    const result = runBeforeChange({
      title: 't',
      variants: { square: 1, wide: 2, hero: 3, portrait: 4, open_graph: 5, editorial: 6 },
    })
    expect(result.status).toBe('partial')
  })
})
