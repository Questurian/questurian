import { describe, expect, it, vi } from 'vitest'

import { findHomepageFeaturedDoc } from '@/features/homepage-featured-content/featured-articles/lib/repository'
import { findHotelDoc } from '@/features/homepage-featured-content/hotel-grid/lib/repository'
import { findLocationGridDoc } from '@/features/homepage-featured-content/location-grid/lib/repository'
import { findAttractionDoc } from '@/features/homepage-featured-content/things-to-do-attractions/lib/repository'
import { findTourDoc } from '@/features/homepage-featured-content/tour-grid/lib/repository'

import { isNotFoundError, whenNotFound } from './not-found-error'

class NotFound extends Error {
  status = 404
  name = 'NotFound'
}

describe('isNotFoundError', () => {
  it('recognises Payload not-found by shape', () => {
    expect(isNotFoundError(new NotFound())).toBe(true)
    expect(isNotFoundError({ status: 404 })).toBe(true)
  })

  it('does not mistake a failure for a deletion', () => {
    expect(isNotFoundError(new Error('canceling statement due to statement timeout'))).toBe(false)
    expect(isNotFoundError({ status: 500 })).toBe(false)
    expect(isNotFoundError(null)).toBe(false)
  })

  it('rethrows anything that is not a not-found', () => {
    expect(whenNotFound(new NotFound(), 'gone')).toBe('gone')
    expect(() => whenNotFound(new Error('pool exhausted'), 'gone')).toThrow('pool exhausted')
  })
})

// A curated page used to render every slot whose read failed as if the
// editor had deleted it, answer 200, and get cached that way.
describe.each([
  ['featured article', (payload: never) => findHomepageFeaturedDoc(payload, { relationTo: 'articles', id: 1 } as never)],
  ['hotel', (payload: never) => findHotelDoc(payload, { id: 1 } as never)],
  ['location grid', (payload: never) => findLocationGridDoc(payload, { id: 1 } as never)],
  ['attraction', (payload: never) => findAttractionDoc(payload, { id: 1 } as never)],
  ['tour', (payload: never) => findTourDoc(payload, { id: 1 } as never)],
])('%s repository', (_name, find) => {
  it('omits a deleted document', async () => {
    const payload = { findByID: vi.fn().mockRejectedValue(new NotFound()) }
    await expect(find(payload as never)).resolves.toBeNull()
  })

  it('propagates a failed read instead of omitting the slot', async () => {
    const payload = { findByID: vi.fn().mockRejectedValue(new Error('canceling statement due to statement timeout')) }
    await expect(find(payload as never)).rejects.toThrow('statement timeout')
  })
})
