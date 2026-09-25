import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// A segment's loading.tsx is a Suspense boundary around its page. Next sends
// the shell (HTTP 200) before the page finishes, so a notFound() in the page
// comes too late to change the status: the reader gets the not-found page with
// noindex, but crawlers and launch checks see 200. The front-door readiness
// check caught this on missing and draft itineraries (launch fix plan item 10).
//
// The rule: a dynamic segment with a loading.tsx decides existence in its own
// layout.tsx, which renders above that boundary, and calls notFound() there.

const APP = dirname(fileURLToPath(import.meta.url))

function loadingFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...loadingFiles(path))
    else if (entry.name === 'loading.tsx') found.push(path)
  }
  return found
}

const dynamicLoading = loadingFiles(APP).filter((path) => relative(APP, path).includes('['))

test('the itinerary route is still covered (the rule is not vacuous)', () => {
  assert.ok(
    dynamicLoading.some((path) => relative(APP, path).includes('itineraries/[slug]')),
    'expected itineraries/[slug]/loading.tsx; if it was removed, update this test',
  )
})

test('every dynamic segment with a loading.tsx decides notFound in its layout', () => {
  for (const loading of dynamicLoading) {
    const segment = relative(APP, dirname(loading))
    const layout = join(dirname(loading), 'layout.tsx')
    assert.ok(
      existsSync(layout),
      `${segment} has a loading.tsx but no layout.tsx: a notFound() in its page streams as HTTP 200`,
    )
    const source = readFileSync(layout, 'utf8')
    assert.match(source, /from 'next\/navigation'/, `${segment}/layout.tsx does not import from next/navigation`)
    assert.match(source, /\bnotFound\(\)/, `${segment}/layout.tsx does not call notFound()`)
  }
})

test('the itinerary layout rejects what the page would reject', () => {
  const dir = join(APP, '(public)', '[country]', '[city]', 'itineraries', '[slug]')
  const layout = readFileSync(join(dir, 'layout.tsx'), 'utf8')
  for (const guard of ['guardCountrySegment', 'guardCitySegment', 'guardArticleSlug', 'fetchArticle', 'isListicleItineraryArticle']) {
    assert.match(layout, new RegExp(`\\b${guard}\\(`), `itinerary layout does not call ${guard}`)
  }
  assert.match(layout, /type: 'itineraries'/, 'itinerary layout must fetch the itineraries type')
})
