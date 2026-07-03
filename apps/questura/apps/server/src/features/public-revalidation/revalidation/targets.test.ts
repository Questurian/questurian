import { describe, expect, it } from 'vitest'
import {
  articleRevalidationTarget,
  locationTarget,
  mergeTargets,
  redirectTarget,
} from './targets'

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
})
