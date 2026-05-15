import { describe, expect, it, vi } from 'vitest'

import { validateHomepageFeaturedItems } from './featured-articles/service'
import { validateHotelGridItems } from './hotel-grid/service'
import { validateLocationGridItems } from './location-grid/service'
import { validateThingsToDoAttractionsItems } from './things-to-do-attractions/service'
import { validateTourGridItems } from './tour-grid/service'

const SLOTS_4 = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
const SLOTS_3 = [{ id: 1 }, { id: 2 }, { id: 3 }]

const cardMediaSet = {
  variants: {
    thumbnail: { url: 'https://cdn.example/thumb.webp' },
  },
}

const emptyMediaSet = {
  variants: {
    open_graph: { url: 'https://cdn.example/og.webp' },
  },
}

function payloadOf(impl: (id: number) => unknown) {
  return {
    findByID: vi.fn(async ({ id }: { id: number }) => impl(id)),
    find: vi.fn(),
  }
}

describe('curated homepage image readiness', () => {
  it('fails closed when a hotel gallery has no card variant', async () => {
    const payload = payloadOf((id) => ({
      id,
      title: `Hotel ${id}`,
      status: 'published',
      gallery: [{ image: id === 3 ? emptyMediaSet : cardMediaSet }],
    }))

    await expect(
      validateHotelGridItems(payload as never, SLOTS_4, { allowDrafts: true, slotCount: 4 }),
    ).rejects.toThrow('Hotel "Hotel 3" is missing a gallery card image')
  })

  it('fails closed when a tour image media set has no card variant', async () => {
    const payload = payloadOf((id) => ({
      id,
      title: `Tour ${id}`,
      status: 'published',
      img: id === 2 ? emptyMediaSet : cardMediaSet,
    }))

    await expect(
      validateTourGridItems(payload as never, SLOTS_4, { allowDrafts: true, slotCount: 4 }),
    ).rejects.toThrow('Tour "Tour 2" is missing a card image')
  })

  it('fails closed when an attraction gallery has no card variant', async () => {
    const payload = payloadOf((id) => ({
      id,
      title: `Spot ${id}`,
      status: 'published',
      gallery: [{ image: id === 1 ? emptyMediaSet : cardMediaSet }],
    }))

    await expect(
      validateThingsToDoAttractionsItems(payload as never, SLOTS_3, {
        allowDrafts: true,
        slotCount: 3,
      }),
    ).rejects.toThrow('Attraction "Spot 1" is missing a gallery card image')
  })

  it('fails closed when a location-grid cover image has no card variant', async () => {
    const payload = payloadOf((id) => ({
      id,
      level: 'neighborhood',
      locationKey: `usa|austin|n-${id}`,
      parentKey: 'usa|austin',
      countryName: 'United States',
      cityName: 'Austin',
      neighborhoodName: `N${id}`,
      coverImage: id === 4 ? emptyMediaSet : cardMediaSet,
    }))

    await expect(
      validateLocationGridItems(payload as never, SLOTS_4, {
        slotCount: 4,
        scope: { childLevel: 'neighborhood', parentKey: 'usa|austin' },
      }),
    ).rejects.toThrow('Location "N4" is missing a cover image card variant')
  })

  it('fails closed when a featured article has no resolvable featured image', async () => {
    const payload = payloadOf((id) => ({
      id,
      title: `Article ${id}`,
      status: 'published',
      headerSection: {
        featuredImage:
          id === 2
            ? { bunny_original_url: null, url: null }
            : { url: `https://cdn.example/article-${id}.webp` },
      },
    }))

    await expect(
      validateHomepageFeaturedItems(
        payload as never,
        [
          { relationTo: 'articles', id: 1 },
          { relationTo: 'articles', id: 2 },
          { relationTo: 'articles', id: 3 },
        ],
        { allowDrafts: true, slotCount: 3 },
      ),
    ).rejects.toThrow('"Article 2" is missing a featured image')
  })
})
