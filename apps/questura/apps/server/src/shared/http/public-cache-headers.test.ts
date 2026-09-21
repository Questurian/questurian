import { NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'

import {
  PRIVATE_CACHE_CONTROL,
  PUBLIC_READ_CACHE_CONTROL,
  withPublicCacheHeaders,
} from './public-cache-headers'

describe('withPublicCacheHeaders', () => {
  it('lets a successful public read be reused briefly', () => {
    const response = withPublicCacheHeaders(NextResponse.json({ ok: true }))
    expect(response.headers.get('Cache-Control')).toBe(PUBLIC_READ_CACHE_CONTROL)
  })

  // A 404 cached for ten minutes outlives the publish that fixes it.
  it('never widens an error into a cacheable response', () => {
    for (const status of [400, 404, 429, 500]) {
      const response = withPublicCacheHeaders(NextResponse.json({ message: 'no' }, { status }))
      expect(response.headers.get('Cache-Control')).toBe(PRIVATE_CACHE_CONTROL)
    }
  })

  it('stays well short of the frontend cache, which invalidates by tag', () => {
    const maxAge = Number(/s-maxage=(\d+)/.exec(PUBLIC_READ_CACHE_CONTROL)?.[1])
    expect(maxAge).toBeGreaterThan(0)
    expect(maxAge).toBeLessThanOrEqual(60)
  })
})
