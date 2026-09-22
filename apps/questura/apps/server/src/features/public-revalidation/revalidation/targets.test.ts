import { describe, expect, it, vi } from 'vitest'
import {
  articleRevalidationTarget,
  authoredArticlesTarget,
  AUTHOR_PAGE_SIZE,
  locationHomepageTarget,
  locationTarget,
  mergeTargets,
  redirectTarget,
} from './targets'
import { LocationLookupFailed } from './documents'
import type { PayloadRequest } from 'payload'

describe('public revalidation target builders', () => {
  it('builds article tags and paths for published city-scoped maps', () => {
    expect(
      articleRevalidationTarget('single-type-listicles', {
        status: 'published',
        language: 'en',
        slug: 'best-rooftops',
        location: 'Peru|Lima',
      }),
    ).toEqual({
      tags: [
        'sitemap',
        'article-index:city:peru:lima:maps:en',
        'article-path:%2Fperu%2Flima%2Fmaps%2Fbest-rooftops:en',
        'article:city:peru:lima:maps:best-rooftops:en',
        'related-maps:peru:lima',
      ],
      paths: ['/Peru/Lima/maps/best-rooftops'],
    })
  })

  it('returns no article target for drafts', () => {
    expect(
      articleRevalidationTarget('articles', {
        status: 'draft',
        canonicalPath: '/news/story',
        slug: 'story',
      }),
    ).toEqual({})
  })

  it('builds location homepage tags from location keys', () => {
    expect(locationTarget({ locationKey: 'Peru|Lima' })).toEqual({
      tags: ['sitemap', 'country-cities:peru', 'location-homepage:peru:lima'],
      paths: ['/Peru', '/Peru/Lima'],
    })
  })

  it('invalidates both parent-city and neighborhood homepage caches', () => {
    expect(locationTarget({ locationKey: 'Peru|Lima|Miraflores' })).toEqual({
      tags: [
        'sitemap',
        'country-cities:peru',
        'location-homepage:peru:lima',
        'location-homepage:peru:lima:miraflores',
      ],
      paths: ['/Peru', '/Peru/Lima', '/Peru/Lima/Miraflores'],
    })
  })

  it('dedupes merged tags and paths', () => {
    expect(
      mergeTargets(
        { tags: ['sitemap', 'sitemap'], paths: ['/peru'] },
        { tags: ['sitemap'], paths: ['/peru', '/peru/lima'] },
      ),
    ).toEqual({
      tags: ['sitemap'],
      paths: ['/peru', '/peru/lima'],
    })
  })

  it('targets article redirects by old path', () => {
    expect(redirectTarget({ oldPath: '/old' })).toEqual({
      tags: ['article-redirect:%2Fold'],
      paths: ['/old'],
    })
  })

  it('targets every published article carrying an edited Author byline', async () => {
    const req = {
      payload: {
        find: async ({ collection }: { collection: string }) => ({
          docs:
            collection === 'articles'
              ? [
                  {
                    status: 'published',
                    language: 'en',
                    slug: 'creator-story',
                    canonicalPath: '/peru/lima/food/creator-story',
                  },
                ]
              : collection === 'single-type-listicles'
                ? [
                    {
                      status: 'published',
                      language: 'en',
                      slug: 'creator-brunch',
                      location: 'peru|lima',
                    },
                  ]
                : [],
        }),
      },
    } as unknown as PayloadRequest

    const target = await authoredArticlesTarget(req, 42)

    expect(target.paths).toEqual([
      '/peru/lima/food/creator-story',
      '/peru/lima/maps/creator-brunch',
    ])
  })
})

/**
 * L03: the fan-out has to be complete and bounded at the same time.
 *
 * `pagination: false` was complete but unbounded — every published document
 * by an author, every field, materialised inside the editor's save. Chunked
 * delivery is bounded but must never become truncation: the frontend refuses
 * more than a hundred entries per request, and the old code sent the whole
 * target in one, so a large rename failed eight times and gave up with none
 * of its pages refreshed.
 */
describe('author fan-out at scale', () => {
  function authorWith(articleCount: number) {
    const pages: Array<{ collection: string; page: number; limit: number; select?: unknown }> = []

    const payload = {
      find: vi.fn(async (args: { collection: string; page?: number; limit?: number; select?: unknown }) => {
        const page = args.page ?? 1
        const limit = args.limit ?? 10
        pages.push({ collection: args.collection, page, limit, select: args.select })

        // Only `articles` has a corpus; the other two are empty.
        if (args.collection !== 'articles') return { docs: [], hasNextPage: false }

        const start = (page - 1) * limit
        const docs = Array.from({ length: Math.max(0, Math.min(limit, articleCount - start)) }, (_, index) => ({
          id: start + index + 1,
          slug: `article-${start + index + 1}`,
          status: 'published',
          language: 'en',
          location: 'peru|lima',
          canonicalPath: `/peru/lima/guides/article-${start + index + 1}`,
        }))

        return { docs, hasNextPage: start + docs.length < articleCount }
      }),
    }

    return { req: { payload } as never, pages }
  }

  it('reads pages rather than the whole corpus, and only the fields it uses', async () => {
    const { req, pages } = authorWith(450)
    const target = await authoredArticlesTarget(req, 7)

    const articlePages = pages.filter((page) => page.collection === 'articles')
    expect(articlePages.map((page) => page.page)).toEqual([1, 2, 3])
    expect(articlePages.every((page) => page.limit === AUTHOR_PAGE_SIZE)).toBe(true)
    expect(articlePages[0]?.select).toBeDefined()

    // Every one of the 450 articles is in the target: bounded reads, complete
    // result.
    expect(target.paths).toHaveLength(450)
  })

  it('stops at the last page instead of looping forever on an empty one', async () => {
    const { req, pages } = authorWith(400)
    await authoredArticlesTarget(req, 7)
    expect(pages.filter((page) => page.collection === 'articles')).toHaveLength(2)
  })

  it('finds nothing for an author with no published work, without a wasted second page', async () => {
    const { req, pages } = authorWith(0)
    const target = await authoredArticlesTarget(req, 7)
    expect(target.paths).toEqual([])
    expect(pages.filter((page) => page.collection === 'articles')).toHaveLength(1)
  })
})


/**
 * A lookup that failed and a location that is not there used to be the same
 * answer: `catch { return null }`. A timeout during target discovery became
 * "this document has no location", the target was built from what was left,
 * and the country and city pages that actually changed were never refreshed —
 * with nothing recording that they had been missed.
 */
describe('location lookup failure is not a missing location', () => {
  function reqThatThrows(error: unknown) {
    return { payload: { findByID: vi.fn(async () => { throw error }) } } as never
  }

  it('fails the save when the location could not be read', async () => {
    const req = reqThatThrows(new Error('timeout expired'))
    await expect(locationHomepageTarget(req, { location: 42 })).rejects.toThrow(LocationLookupFailed)
  })

  it('names the location and says nothing was published', async () => {
    const req = reqThatThrows(new Error('connection terminated'))
    await expect(locationHomepageTarget(req, { location: 42 })).rejects.toThrow(/42[\s\S]*Nothing was published/)
  })

  it.each([
    ['a NotFound error', Object.assign(new Error('x'), { name: 'NotFound' })],
    ['a 404 status', Object.assign(new Error('x'), { status: 404 })],
    ['a "not found" message', new Error('The requested resource was not found.')],
  ])('treats %s as a real answer and keeps going', async (_label, error) => {
    const req = reqThatThrows(error)
    await expect(locationHomepageTarget(req, { location: 42 })).resolves.toEqual({ tags: ['sitemap'] })
  })

  it('does not look up a location that is already embedded', async () => {
    const findByID = vi.fn()
    const req = { payload: { findByID } } as never
    const target = await locationHomepageTarget(req, { location: { id: 1, locationKey: 'peru|lima' } })

    expect(findByID).not.toHaveBeenCalled()
    expect(target.paths).toEqual(['/peru', '/peru/lima'])
  })
})
