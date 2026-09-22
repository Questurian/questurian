import http from 'k6/http'
import { check, fail } from 'k6'
import { Counter, Trend } from 'k6/metrics'

import { BASE_URL, CLIENT_URL, ORIGIN } from './config.js'
import { identityExpectation, WORKLOAD } from './workload.js'

// Each request is tagged `kind` so the gates can hold pages and dynamic reads
// to different latency budgets, and `name` so the URL mix does not explode
// the metric cardinality.
//
// Every check here is an *exact* one. The previous versions accepted any
// 200/307/308 with `<html` in it and any boolean identity, which meant a
// backend serving the wrong article, redirecting to the wrong place, or
// answering `authenticated: false` to a member all counted as success. Those
// are precisely the failures a campaign would produce and a reader would
// notice, so they are the ones the proof has to be able to catch.

/** Time to first byte, separate from full duration: a slow body is not a slow server. */
export const ttfb = new Trend('questura_ttfb', true)
/** Legitimate refusals, counted apart from latency so no average hides them. */
export const refusals = new Counter('questura_refusals')
/** Responses that were right in status but wrong in content. */
export const wrongContent = new Counter('questura_wrong_content')

function expectationFor(path) {
  if (!WORKLOAD) return null
  const clean = path.split('?')[0]
  const found = WORKLOAD.pages.find((page) => page.path === clean)
  return found ? found.expect : null
}

function record(response) {
  ttfb.add(response.timings.waiting, { kind: response.request.tags ? response.request.tags.kind : 'page' })
  if (response.status === 429 || response.status === 503) refusals.add(1)
}

/**
 * A page request, checked against what the manifest says that URL must
 * produce.
 *
 * `readerFailure` is the default: for a reader, a 429 or a 503 is an outage,
 * so it fails the check. Deliberate-overload scenarios pass
 * `{ refusalIsExpected: true }` and count refusals separately.
 */
export function page(path, name = 'page', options = {}) {
  const expected = options.expect || expectationFor(path)
  const response = http.get(`${CLIENT_URL}${path}`, { tags: { kind: 'page', name }, redirects: 0 })
  record(response)

  if (!expected) {
    // No manifest entry: say so rather than silently checking nothing.
    check(response, { [`${name}: unexpected URL, no manifest entry`]: () => false })
    return response
  }

  const checks = {}
  checks[`${name}: status is ${expected.status}`] = (r) =>
    r.status === expected.status || (options.refusalIsExpected && (r.status === 429 || r.status === 503))

  if (expected.location) {
    checks[`${name}: redirects to ${expected.location}`] = (r) =>
      r.status !== expected.status || (r.headers['Location'] || '') === expected.location
  }

  if (expected.contains) {
    checks[`${name}: is the expected page`] = (r) => {
      if (r.status !== 200) return r.status !== 200 && Boolean(options.refusalIsExpected)
      const ok = (r.body || '').includes(expected.contains)
      if (!ok) wrongContent.add(1)
      return ok
    }
  }

  if (expected.excludes) {
    checks[`${name}: does not leak ${expected.excludes}`] = (r) => !(r.body || '').includes(expected.excludes)
  }

  if (expected.cacheable === true) {
    checks[`${name}: is publicly cacheable`] = (r) =>
      r.status !== 200 || /(^|,\s*)(public|s-maxage)/i.test(r.headers['Cache-Control'] || '')
    // A cacheable response carrying a session cookie is a shared-cache leak.
    checks[`${name}: sets no cookie on a cacheable response`] = (r) => !r.headers['Set-Cookie']
  }

  if (expected.cacheable === false) {
    checks[`${name}: is not stored`] = (r) => /no-store/i.test(r.headers['Cache-Control'] || '')
  }

  check(response, checks, options.tags || {})
  return response
}

/**
 * `/api/me`, checked against the identity this caller is supposed to have.
 *
 * The old check accepted any boolean. A member whose session stopped working
 * came back `authenticated: false` and passed — so a signed-in load test
 * could be measuring entirely anonymous traffic and report a clean result.
 */
export function identity(cookie, options = {}) {
  const expected = options.expect || identityExpectation(Boolean(cookie))
  const headers = { Origin: ORIGIN }
  if (cookie) headers.Cookie = cookie

  const response = http.get(`${BASE_URL}/api/me`, { headers, tags: { kind: 'dynamic', name: 'identity' } })
  record(response)

  const body = () => {
    try {
      return response.json()
    } catch {
      return null
    }
  }

  const checks = {
    'identity answered 200': (r) => r.status === 200,
    'identity is JSON': () => body() !== null,
  }

  for (const key of Object.keys(expected)) {
    checks[`identity ${key} is ${expected[key]}`] = () => {
      const parsed = body()
      return parsed !== null && parsed[key] === expected[key]
    }
  }

  // Private by definition. A cached /api/me is one reader seeing another's.
  checks['identity is never stored'] = (r) => /no-store/i.test(r.headers['Cache-Control'] || '')

  check(response, checks, options.tags || {})
  return response
}

export function api(path, name, options = {}) {
  const response = http.get(`${BASE_URL}${path}`, {
    headers: options.headers || {},
    tags: { kind: 'dynamic', name },
  })
  record(response)

  const checks = { [`${name} answered 200`]: (r) => r.status === 200 }
  if (options.contains) {
    checks[`${name} returned the expected body`] = (r) => (r.body || '').includes(options.contains)
  }
  check(response, checks, options.tags || {})
  return response
}

/** Refuse a scenario whose corpus cannot support what it claims to measure. */
export function requireCorpus(list, minimum, what) {
  if (list.length < minimum) {
    fail(`${what} needs at least ${minimum} distinct URLs; the workload supplied ${list.length}`)
  }
  return list
}
