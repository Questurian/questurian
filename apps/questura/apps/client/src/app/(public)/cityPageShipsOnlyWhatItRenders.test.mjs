import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const cityPage = readFileSync(
  fileURLToPath(new URL('./[country]/[city]/page.tsx', import.meta.url)),
  'utf8',
)
const countryPage = readFileSync(
  fileURLToPath(new URL('./[country]/page.tsx', import.meta.url)),
  'utf8',
)
const fetchSearch = readFileSync(
  fileURLToPath(new URL('../../features/search/lib/fetchSearch.ts', import.meta.url)),
  'utf8',
)

// Next takes the SHORTEST revalidate of any fetch in a render. One
// search-shaped 300s default sitting in a cached location page capped the
// whole route at five minutes, against an hour everywhere else. Every cached
// public page that reaches for this list has to name the long window.
test('cached location pages ask for the public-page cache window', () => {
  for (const [name, source] of [
    ['[country]/[city]/page.tsx', cityPage],
    ['[country]/page.tsx', countryPage],
  ]) {
    for (const call of source.matchAll(/fetchLocationContent\(([^)]*)\)/gs)) {
      assert.match(
        call[0],
        /'public-page'/,
        `${name} calls fetchLocationContent without 'public-page', which caps the route at the search window`,
      )
    }
  }
})

// The knob has to stay a caller's choice. Hardcoding it back inside the
// fetcher is how one page's cache policy became every page's.
test('fetchLocationContent does not hardcode its revalidate', () => {
  const body = fetchSearch.slice(fetchSearch.indexOf('export async function fetchLocationContent'))
  assert.doesNotMatch(
    body,
    /revalidate:\s*\d+/,
    'fetchLocationContent hardcodes a revalidate again — take it from the caller',
  )
})

// The happy path renders curated blocks and never looks at the flat content
// list. Fetching it anyway cost fifty articles of body and, through the
// shared revalidate, the route's cache life.
test('the curated path does not fetch the content list', () => {
  const happyPath = cityPage.slice(cityPage.indexOf('export default async function CityPage'))
  const guard = happyPath.indexOf('if (!data)')
  assert.notEqual(guard, -1, 'CityPage no longer branches on a missing homepage')
  assert.equal(
    happyPath.slice(0, guard).includes('fetchFallbackContent'),
    false,
    'CityPage fetches the content list before it knows whether it needs it',
  )
})

// A client component's props are serialized into the HTML whether or not its
// body does anything. The debug logger's NODE_ENV check lives inside a
// useEffect, so it stopped the console.log and shipped the payload anyway:
// 56 kB of duplicated API response, a fifth of the served page. The gate has
// to be at the call site, where it can keep the element out of the tree.
test('the debug logger is gated where it is rendered', () => {
  const at = cityPage.indexOf('<CityHomepagePayloadDebugLogger')
  assert.notEqual(at, -1, 'CityPage no longer renders the debug logger at all')
  const preceding = cityPage.slice(Math.max(0, at - 200), at)
  assert.ok(
    preceding.includes("process.env.NODE_ENV === 'development'"),
    'CityPage renders CityHomepagePayloadDebugLogger without a build-time dev gate — its data prop will ship to production readers',
  )
})
