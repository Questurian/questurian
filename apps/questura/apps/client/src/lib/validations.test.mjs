import assert from 'node:assert/strict'
import test from 'node:test'

import { getSafeRedirectPath, isValidRedirectPath } from './validations.ts'

// Where the sign-in page, password sign-in, the protected-route bounce and
// the post-checkout page send a visitor next. The value comes straight from
// the URL, so anyone can write it into a link to our own /auth page. A path
// that resolves off-site is an open redirect: sign in, land on a look-alike.
const SITE = 'https://www.questurian.com'
const resolvesOnSite = (path) => new URL(path, `${SITE}/auth`).origin === SITE

const OFF_SITE = [
  '//evil.com',
  '/\\evil.com',
  '/\\/evil.com',
  '\\\\evil.com',
  '/\t/evil.com',
  '/\n/evil.com',
  '/\r/evil.com',
  '/\t\\evil.com',
  'https://evil.com',
  'javascript:alert(1)',
  '/%5Cevil.com',
  '/%09/evil.com',
  '/%0A/evil.com',
  '%2F%2Fevil.com',
  '/%5C%5Cevil.com',
]

test('every off-site payload is refused, raw or as a URL would carry it', () => {
  for (const payload of OFF_SITE) {
    const out = getSafeRedirectPath(payload)
    assert.equal(out, '/', `${JSON.stringify(payload)} gave ${JSON.stringify(out)}`)
  }
})

test('isValidRedirectPath refuses backslashes and control characters', () => {
  for (const path of ['/\\evil.com', '/a\\b', '/\t/evil.com', '/\n', '/\u0000', '/\u007f']) {
    assert.equal(isValidRedirectPath(path), false, JSON.stringify(path))
  }
})

test('ordinary on-site paths survive unchanged', () => {
  for (const path of ['/', '/account', '/articles/rome-food?x=1#top', '/join?returnTo=%2Faccount', '/caf%C3%A9']) {
    assert.equal(getSafeRedirectPath(path), decodeURIComponent(path))
  }
})

// Seeded random strings built from the characters redirects are made of.
// Whatever the guard lets through must stay on this site when the browser
// resolves it. Seeded, so a failure reproduces.
test('whatever it returns resolves on this site', () => {
  let seed = 0x0badc0de
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
    return seed / 2 ** 31
  }
  const pieces = ['/', '//', '\\', '\t', '\n', '\r', ' ', '%2F', '%5C', '%09', '%0A', '%', 'evil.com', ':', '@', '.', '..', '?', '#', 'https:', 'javascript:', 'a', 'é', '\u0000']

  for (let i = 0; i < 50_000; i += 1) {
    let candidate = ''
    const length = 1 + Math.floor(random() * 6)
    for (let j = 0; j < length; j += 1) candidate += pieces[Math.floor(random() * pieces.length)]

    const out = getSafeRedirectPath(candidate)
    assert.ok(resolvesOnSite(out), `${JSON.stringify(candidate)} -> ${JSON.stringify(out)} leaves the site`)
  }
})
