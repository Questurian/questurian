import { describe, expect, it } from 'vitest'

import { normalizeHomepageFeaturedCandidate } from './featured-articles/lib/candidate'
import { normalizeHotelCandidate } from './hotel-grid/lib/candidate'
import { normalizeLocationGridCandidate } from './location-grid/lib/candidate'
import {
  ACCOMMODATION_ROOT_SELECT,
  ATTRACTION_ROOT_SELECT,
  HOMEPAGE_BLOCK_POPULATE,
  TOUR_ROOT_SELECT,
} from './populate'
import { normalizeAttractionCandidate } from './things-to-do-attractions/lib/candidate'
import { normalizeTourCandidate } from './tour-grid/lib/candidate'

/**
 * `HOMEPAGE_BLOCK_POPULATE` is a silent coupling: a normalizer that starts
 * reading a field the map does not fetch gets `undefined` instead of failing,
 * and the page quietly loses a byline or a label (#596).
 *
 * These tests run the real normalizers over documents whose populated
 * relationships are recording proxies, then check that every field a
 * normalizer touched is one the map actually asks for. A collection absent
 * from the map populates in full, so nothing is asserted about it.
 */

type Reads = Map<string, Set<string>>

/** A populated document of `slug` that records every field read off it. */
function populated(
  reads: Reads,
  slug: string,
  doc: Record<string, unknown>,
): Record<string, unknown> {
  let bucket = reads.get(slug)
  if (!bucket) {
    bucket = new Set<string>()
    reads.set(slug, bucket)
  }
  const seen = bucket
  return new Proxy(doc, {
    get(target, property, receiver) {
      if (typeof property === 'string') seen.add(property)
      return Reflect.get(target, property, receiver)
    },
  })
}

function expectEveryReadFieldIsPopulated(reads: Reads): void {
  for (const [slug, fields] of reads) {
    const select = (HOMEPAGE_BLOCK_POPULATE as Record<string, unknown>)[slug]
    // Not in the map means unrestricted: every field comes back.
    if (!select || typeof select !== 'object') continue

    // Payload returns `id` whatever the select says.
    const fetched = new Set(['id', ...Object.keys(select)])
    const missing = [...fields].filter((field) => !fetched.has(field)).sort()

    expect({ slug, missing }).toEqual({ slug, missing: [] })
  }
}

/** A media set is unrestricted enough to resolve a placement from. */
function mediaSet(reads: Reads): Record<string, unknown> {
  return populated(reads, 'media-sets', {
    id: 90,
    title: 'Set',
    alt_text: 'A plaza at dusk',
    variants: {
      thumbnail: populated(reads, 'media-assets', {
        id: 91,
        url: 'https://cdn.example/thumb.webp',
        filename: 'thumb.webp',
        alt_text: 'A plaza at dusk',
        width: 400,
        height: 300,
      }),
      square: populated(reads, 'media-assets', {
        id: 92,
        url: 'https://cdn.example/square.webp',
        filename: 'square.webp',
        alt_text: 'A plaza at dusk',
        width: 400,
        height: 400,
      }),
    },
  })
}

function locationRef(reads: Reads): Record<string, unknown> {
  return populated(reads, 'locations', {
    id: 7,
    locationKey: 'peru|lima|barranco',
    countryName: 'Peru',
    cityName: 'Lima',
    neighborhoodName: 'Barranco',
  })
}

/**
 * The root `select` has the same silent coupling as the populate map: a field
 * the normalizer reads but the select omits comes back `undefined`.
 *
 * `notFields` names reads that are not columns on the collection at all —
 * `slug` on accommodations and attractions, which payload-types confirms do
 * not have one. Those reads have always produced `null`; selecting them would
 * ask Payload for a field that does not exist.
 */
function expectSelectCoversRootReads(
  select: Record<string, unknown>,
  doc: Record<string, unknown>,
  normalize: (doc: never) => unknown,
  notFields: string[] = [],
): void {
  const read = new Set<string>()
  const recording = new Proxy(doc, {
    get(target, property, receiver) {
      if (typeof property === 'string') read.add(property)
      return Reflect.get(target, property, receiver)
    },
  })

  normalize(recording as never)

  // Payload returns `id` whatever the select says.
  const fetched = new Set(['id', ...Object.keys(select), ...notFields])
  const missing = [...read].filter((field) => !fetched.has(field)).sort()
  expect(missing).toEqual([])

  // A select that asks for more than the normalizer reads is cost with no
  // reader — the whole point of #596.
  const unread = Object.keys(select)
    .filter((field) => !read.has(field))
    .sort()
  expect(unread).toEqual([])
}

describe('homepage block root selects', () => {
  it('fetches exactly the accommodation fields the hotel normalizer reads', () => {
    expectSelectCoversRootReads(
      ACCOMMODATION_ROOT_SELECT,
      {
        id: 10,
        title: 'A hotel',
        status: 'published',
        updatedAt: '2026-09-01T00:00:00.000Z',
        type: 'Hotel',
        priceLevel: '$$',
        location: 'peru|lima|barranco',
        // Empty for the same reason: a resolvable `locationRef` short-circuits
        // before the normalizer ever reads the legacy `location` key.
        locationRef: { locationKey: '', neighborhoodName: '' },
        // Every group value here is empty on purpose. The normalizer reads
        // the group first and only falls through to the root field when it
        // finds nothing, so a filled group hides those reads behind `||`
        // and the test would call a needed field unread.
        core: { type: '', price: '', district: '' },
        theStay: { breakfastServed: true, wifi: true, kidFriendly: true },
        theExperience: { vibe: ['Quiet'], pool: ['rooftop'], rooftopLounge: true, gym: '24/7', restaurant: true },
        theDetails: { walkability: 'Very walkable', bookingUrl: 'https://example.com/book' },
        gallery: [],
      },
      (doc) => normalizeHotelCandidate(doc),
      ['slug'],
    )
  })

  it('fetches exactly the tour fields the tour normalizer reads', () => {
    expectSelectCoversRootReads(
      TOUR_ROOT_SELECT,
      {
        id: 20,
        title: 'A tour',
        status: 'published',
        updatedAt: '2026-09-01T00:00:00.000Z',
        price: 'From $45',
        bookingLink: 'https://www.viator.com/tour',
        locationRef: { neighborhoodName: 'Barranco', cityName: 'Lima' },
        img: null,
      },
      (doc) => normalizeTourCandidate(doc),
    )
  })

  it('fetches exactly the attraction fields the attraction normalizer reads', () => {
    expectSelectCoversRootReads(
      ATTRACTION_ROOT_SELECT,
      {
        id: 30,
        title: 'An attraction',
        status: 'published',
        updatedAt: '2026-09-01T00:00:00.000Z',
        type: 'Museum',
        priceLevel: 'Free',
        location: 'peru|lima|barranco',
        locationRef: { locationKey: 'peru|lima|barranco', cityName: 'Lima' },
        attractionsDetails: {
          // Empty, so the root `type` / `priceLevel` fallback is exercised.
          core: { attractionType: '', pricing: '' },
          visit: { bookingRequired: true, bookingUrl: 'https://example.com/tickets' },
        },
        gallery: [],
      },
      (doc) => normalizeAttractionCandidate(doc),
      ['slug'],
    )
  })

  it('keeps createdBy out of all three, which is what removes the users query', () => {
    for (const select of [ACCOMMODATION_ROOT_SELECT, TOUR_ROOT_SELECT, ATTRACTION_ROOT_SELECT]) {
      expect(select).not.toHaveProperty('createdBy')
    }
    // An attraction's `tours` and the Instagram galleries are the other
    // relationships a selectless read was following.
    expect(ATTRACTION_ROOT_SELECT).not.toHaveProperty('tours')
    expect(ACCOMMODATION_ROOT_SELECT).not.toHaveProperty('instagramGallery')
    expect(ATTRACTION_ROOT_SELECT).not.toHaveProperty('instagramGallery')
  })
})

describe('homepage block populate map', () => {
  it('fetches every field the featured-article normalizer reads', () => {
    const reads: Reads = new Map()

    normalizeHomepageFeaturedCandidate('articles', {
      id: 1,
      title: 'A title',
      slug: 'a-title',
      canonicalPath: '/peru/lima/a-title',
      location: 'peru|lima',
      status: 'published',
      updatedAt: '2026-09-01T00:00:00.000Z',
      publishedAt: '2026-09-01T00:00:00.000Z',
      seoSection: { metaDescription: 'An excerpt.' },
      headerSection: { featuredMediaSet: mediaSet(reads) },
      author: populated(reads, 'authors', {
        id: 2,
        displayName: 'A Writer',
        slug: 'a-writer',
        avatar: populated(reads, 'media-assets', {
          id: 3,
          url: 'https://cdn.example/avatar.webp',
          alt_text: 'A Writer',
        }),
      }),
      category: populated(reads, 'article-categories', {
        id: 4,
        name: 'Neighborhoods',
        slug: 'neighborhoods',
      }),
    })

    expectEveryReadFieldIsPopulated(reads)
  })

  it('fetches every field the hotel normalizer reads', () => {
    const reads: Reads = new Map()

    normalizeHotelCandidate({
      id: 10,
      title: 'A hotel',
      slug: 'a-hotel',
      status: 'published',
      updatedAt: '2026-09-01T00:00:00.000Z',
      location: 'peru|lima|barranco',
      locationRef: locationRef(reads),
      core: { type: 'Boutique', price: '$$', district: '' },
      theStay: { breakfastServed: true, wifi: true, kidFriendly: true },
      theExperience: { vibe: ['Quiet'], pool: ['rooftop'], rooftopLounge: true, gym: '24/7' },
      theDetails: { walkability: 'Very walkable', bookingUrl: 'https://example.com/book' },
      gallery: [{ image: mediaSet(reads) }],
    } as never)

    expectEveryReadFieldIsPopulated(reads)
  })

  it('fetches every field the tour normalizer reads', () => {
    const reads: Reads = new Map()

    normalizeTourCandidate({
      id: 20,
      title: 'A tour',
      status: 'published',
      updatedAt: '2026-09-01T00:00:00.000Z',
      price: 'From $45',
      bookingLink: 'https://www.viator.com/tour',
      locationRef: locationRef(reads),
      img: mediaSet(reads),
    } as never)

    expectEveryReadFieldIsPopulated(reads)
  })

  it('fetches every field the attraction normalizer reads', () => {
    const reads: Reads = new Map()

    normalizeAttractionCandidate({
      id: 30,
      title: 'An attraction',
      slug: 'an-attraction',
      status: 'published',
      updatedAt: '2026-09-01T00:00:00.000Z',
      location: 'peru|lima|barranco',
      locationRef: locationRef(reads),
      attractionsDetails: {
        core: { attractionType: 'Museum', pricing: 'Free' },
        visit: { bookingRequired: true, bookingUrl: 'https://example.com/tickets' },
      },
      gallery: [{ image: mediaSet(reads) }],
    } as never)

    expectEveryReadFieldIsPopulated(reads)
  })

  it('fetches every field the location-grid normalizer reads', () => {
    const reads: Reads = new Map()

    normalizeLocationGridCandidate({
      id: 40,
      level: 'neighborhood',
      locationKey: 'peru|lima|barranco',
      parentKey: 'peru|lima',
      countryName: 'Peru',
      cityName: 'Lima',
      neighborhoodName: 'Barranco',
      updatedAt: '2026-09-01T00:00:00.000Z',
      coverImage: mediaSet(reads),
    } as never)

    expectEveryReadFieldIsPopulated(reads)
  })

  it('never narrows the media chain a placement resolves from', () => {
    expect(HOMEPAGE_BLOCK_POPULATE['media-assets']).toBeUndefined()
    expect(HOMEPAGE_BLOCK_POPULATE['media-sets']).toMatchObject({ variants: true })
  })
})
