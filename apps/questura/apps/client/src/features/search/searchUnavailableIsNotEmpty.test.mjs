import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * Discovery finding 5: every non-OK search answer became `null`, and the page
 * rendered `null` as "No results". An overloaded or rate-limited backend told
 * readers there was nothing to find. The helper and the page are read as
 * source because the page is a server component the node suite cannot render;
 * the rendered states are checked in the local browser capture (surge L10).
 */

const helper = readFileSync(new URL('./lib/fetchSearch.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../../app/(search)/search/page.tsx', import.meta.url), 'utf8')

const searchArticles = helper.slice(helper.indexOf('export async function searchArticles'), helper.indexOf('export type LocationContentCache'))

test('a failed search is "unavailable", never an empty result', () => {
  assert.match(searchArticles, /if \(!res\.ok\) return \{ unavailable: true, status: res\.status \}/)
  assert.doesNotMatch(searchArticles, /if \(!res\.ok\) return null/)
})

test('the search read carries the server-only render identity and a deadline', () => {
  assert.match(searchArticles, /headers: renderHeaders\(\)/)
  assert.match(searchArticles, /AbortSignal\.timeout\(/)
})

test('the page renders a busy state before it can render "No results"', () => {
  const busy = page.indexOf('data-search-state="unavailable"')
  const empty = page.indexOf('data-search-state="empty"')
  assert.ok(busy > 0 && empty > 0)
  assert.ok(busy < empty, 'the unavailable branch must be decided before the empty branch')
  assert.match(page, /if \(isSearchUnavailable\(answer\)\)/)
})

test('the render token is not a public variable', () => {
  const cache = readFileSync(new URL('../../lib/cache/public-cache.ts', import.meta.url), 'utf8')
  assert.match(cache, /process\.env\.QUESTURA_RENDER_TOKEN/)
  assert.doesNotMatch(cache, /NEXT_PUBLIC_[A-Z_]*RENDER/)
})
