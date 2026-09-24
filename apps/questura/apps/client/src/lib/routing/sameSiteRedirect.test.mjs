import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { isSlugSegment, sameSiteLocation } from './sameSiteRedirect.ts'

const ORIGIN = 'https://questurian.com'

test('an ordinary path stays on the origin, query intact', () => {
  assert.equal(sameSiteLocation('/peru/lima?browse=1', ORIGIN)?.href, 'https://questurian.com/peru/lima?browse=1')
})

// The three spellings from launch fix plan item 17, after the trailing slash
// is stripped, plus the variants URL parsing folds into them.
for (const location of ['//evil.com', '/\\evil.com', '\\\\evil.com', '///evil.com', '/\\/evil.com', '\\/evil.com']) {
  test(`${JSON.stringify(location)} cannot leave the site`, () => {
    const target = sameSiteLocation(location, ORIGIN)
    assert.ok(target, 'still redirects, on site')
    assert.equal(target.origin, ORIGIN)
    assert.equal(target.pathname, '/evil.com')
  })
}

test('an encoded double slash stays an encoded path on the site', () => {
  const target = sameSiteLocation('/%2F%2Fevil.com', ORIGIN)
  assert.equal(target?.origin, ORIGIN)
  assert.equal(target?.pathname, '/%2F%2Fevil.com')
})

test('an absolute URL or scheme is refused, not followed', () => {
  assert.equal(sameSiteLocation('https://evil.com/x', ORIGIN), null)
  assert.equal(sameSiteLocation('javascript:alert(1)', ORIGIN), null)
  assert.equal(sameSiteLocation('evil.com', ORIGIN), null)
})

test('control characters that URL parsing would strip are refused', () => {
  assert.equal(sameSiteLocation('/\t/evil.com', ORIGIN), null)
  assert.equal(sameSiteLocation('/\n/evil.com', ORIGIN), null)
})

test('localhost stays localhost', () => {
  assert.equal(sameSiteLocation('//evil.com', 'http://localhost:3000')?.href, 'http://localhost:3000/evil.com')
})

test('geo cookie segments must be slugs', () => {
  assert.ok(isSlugSegment('peru'))
  assert.ok(isSlugSegment('lima-2'))
  for (const bad of ['/evil.com', '\\evil.com', '', 'a/b', '..', undefined, 3]) {
    assert.equal(isSlugSegment(bad), false, JSON.stringify(bad))
  }
})

// middleware.ts imports next/server, which CI's client job does not install,
// so the wiring is checked by reading the source.
test('middleware builds every redirect through sameSiteLocation', () => {
  const source = readFileSync(new URL('../../middleware.ts', import.meta.url), 'utf8')
  assert.match(source, /sameSiteLocation\(/)
  assert.doesNotMatch(source, /new URL\(location/)
  assert.match(source, /isSlugSegment\(/)
})
