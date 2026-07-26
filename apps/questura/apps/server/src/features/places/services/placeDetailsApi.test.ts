import { describe, expect, it, vi } from 'vitest'

import { fetchPlaceCategories, fetchPlaceDetailResponses } from './placeDetailsApi'

const jsonResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
})

describe('place details API', () => {
  it('loads selected categories through the Payload REST filter', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ docs: [{ id: 1, slug: 'dining', name: 'Dining' }] }),
    )

    await expect(fetchPlaceCategories([1, 'category-2'], fetcher)).resolves.toEqual([
      { id: 1, slug: 'dining' },
    ])
    expect(fetcher).toHaveBeenCalledWith('/api/place-categories?where[id][in]=1,category-2&depth=0')
  })

  it('loads every detail collection in parallel for an existing place', async () => {
    const fetcher = vi.fn(async (url: string) =>
      jsonResponse({ docs: [{ type: url.includes('dining-details') ? 'cafe' : null }] }),
    )

    const result = await fetchPlaceDetailResponses(25, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(fetcher).toHaveBeenCalledWith('/api/dining-details?where[place][equals]=25&depth=0')
    expect(result['dining-details']).toEqual({ docs: [{ type: 'cafe' }] })
  })

  it('rejects a failed Payload response', async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, 503))

    await expect(fetchPlaceCategories([1], fetcher)).rejects.toThrow(
      'Place details request failed (503)',
    )
  })
})
