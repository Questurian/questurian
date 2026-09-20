import assert from 'node:assert/strict'
import test from 'node:test'
import { ARTICLE_TYPE_SEGMENTS } from '../reservedSlugs.ts'
import {
  TYPE_SEGMENTS,
  cityParams,
  cityScopeArticleParams,
  countryParams,
  countryScopeArticleParams,
  globalArticleParams,
  toSegments,
  typedCityArticleParams,
} from './publicRouteParams.ts'

// A slice of a real /api/public/sitemap-entries response: every public route
// shape, plus the index URLs that share a segment count with one of them.
const URLS = [
  '/peru',
  '/colombia',
  '/peru/lima',
  '/colombia/medellin',
  '/peru/articles',
  '/peru/lima/maps',
  '/peru/lima/itineraries',
  '/colombia/medellin/articles',
  '/peru/guides/peru-visa-and-entry-requirements-a-complete-guide',
  '/peru/news/peru-new-rail-safety-rules-cusco-train-crash',
  '/peru/lima/guides/lima-peru-travel-guide-essential-tips-and-attractions',
  '/peru/lima/neighborhoods/where-to-stay-in-san-isidro-lima-a-neighborhood-guide',
  '/peru/lima/maps/best-brunch-lima-peru',
  '/peru/lima/itineraries/2-days-lima-peru-itinerary',
  '/articles/a-global-article',
]

test('the local type-segment list matches reservedSlugs', () => {
  assert.deepEqual([...TYPE_SEGMENTS].sort(), [...ARTICLE_TYPE_SEGMENTS].sort())
})

test('toSegments drops the leading slash, the query and the hash', () => {
  assert.deepEqual(toSegments('/peru/lima/maps/brunch?a=1#b'), ['peru', 'lima', 'maps', 'brunch'])
  assert.deepEqual(toSegments('/'), [])
})

test('country hubs exclude the global article index', () => {
  assert.deepEqual(countryParams(URLS), [{ country: 'peru' }, { country: 'colombia' }])
})

test('city hubs exclude the country-scope index pages', () => {
  assert.deepEqual(cityParams(URLS), [
    { country: 'peru', city: 'lima' },
    { country: 'colombia', city: 'medellin' },
  ])
  // /peru/articles is an index, not a city; /articles/<slug> is not a hub.
  assert.equal(cityParams(['/peru/articles', '/articles/x']).length, 0)
})

test('country-scope articles exclude the three-segment index pages', () => {
  assert.deepEqual(countryScopeArticleParams(URLS), [
    { country: 'peru', city: 'guides', category: 'peru-visa-and-entry-requirements-a-complete-guide' },
    { country: 'peru', city: 'news', category: 'peru-new-rail-safety-rules-cusco-train-crash' },
  ])
})

test('city-scope articles leave maps and itineraries to their own routes', () => {
  assert.deepEqual(cityScopeArticleParams(URLS), [
    {
      country: 'peru',
      city: 'lima',
      category: 'guides',
      slug: 'lima-peru-travel-guide-essential-tips-and-attractions',
    },
    {
      country: 'peru',
      city: 'lima',
      category: 'neighborhoods',
      slug: 'where-to-stay-in-san-isidro-lima-a-neighborhood-guide',
    },
  ])
})

test('typed city articles pick up only their own segment', () => {
  assert.deepEqual(typedCityArticleParams(URLS, 'maps'), [
    { country: 'peru', city: 'lima', slug: 'best-brunch-lima-peru' },
  ])
  assert.deepEqual(typedCityArticleParams(URLS, 'itineraries'), [
    { country: 'peru', city: 'lima', slug: '2-days-lima-peru-itinerary' },
  ])
})

test('global articles are the two-segment /articles URLs', () => {
  assert.deepEqual(globalArticleParams(URLS), [{ slug: 'a-global-article' }])
})

test('no URL is claimed by two routes', () => {
  const claimed = [
    ...countryParams(URLS).map((p) => `/${p.country}`),
    ...cityParams(URLS).map((p) => `/${p.country}/${p.city}`),
    ...countryScopeArticleParams(URLS).map((p) => `/${p.country}/${p.city}/${p.category}`),
    ...cityScopeArticleParams(URLS).map((p) => `/${p.country}/${p.city}/${p.category}/${p.slug}`),
    ...typedCityArticleParams(URLS, 'maps').map((p) => `/${p.country}/${p.city}/maps/${p.slug}`),
    ...typedCityArticleParams(URLS, 'itineraries').map(
      (p) => `/${p.country}/${p.city}/itineraries/${p.slug}`,
    ),
    ...globalArticleParams(URLS).map((p) => `/articles/${p.slug}`),
  ]
  assert.equal(new Set(claimed).size, claimed.length, 'a URL was pre-built by two routes')
  for (const url of claimed) assert.ok(URLS.includes(url), `invented a URL: ${url}`)
})
