import http from 'k6/http'
import { check, fail } from 'k6'
import { Counter, Trend } from 'k6/metrics'

import { BASE_URL, CLIENT_URL, ORIGIN } from './config.js'
import { identityExpectation, WORKLOAD } from './workload.js'

// Each HTTP request is tagged on the request itself — `kind` (page or
// dynamic), `name` (the route class), `signed_in` and `expect` (the outcome
// the manifest requires) — so latency and availability can be thresholded by
// class, not only checks (surge plan L08). Tags on `check()` alone left every
// signed-in request's latency averaged in with the anonymous ones.
//
// Every check here is an exact one, and every correctness failure is also
// emitted as `questura_correctness{class}`, which the supervisor treats as an
// immediate stop: a fast wrong answer is a failure, not a latency sample.
//
//   wrong_content   right status, wrong page or revision
//   privacy         a member marker, another reader's bookmarks, or a member
//                   body where none may appear
//   identity        /api/me said someone other than who this session is
//   cache_policy    a private response that may be stored, or a cacheable
//                   one that sets a cookie
//   refusal_policy  a 429/503 without a valid Retry-After, or cacheable

/** Time to first byte, separate from full duration: a slow body is not a slow server. */
export const ttfb = new Trend('questura_ttfb', true)
/** Legitimate refusals, counted apart from latency so no average hides them. */
export const refusals = new Counter('questura_refusals')
/** Responses that were right in status but wrong in content (kept for older scripts). */
export const wrongContent = new Counter('questura_wrong_content')
/** Every correctness failure, by class. The supervisor stops on the first. */
export const correctness = new Counter('questura_correctness')

function fault(kind, tags = {}) {
  correctness.add(1, { class: kind, ...tags })
  if (kind === 'wrong_content') wrongContent.add(1)
}

function expectationFor(path) {
  if (!WORKLOAD) return null
  // Exact first (a search is its query), then without the query string.
  const exact = WORKLOAD.pages.find((page) => page.path === path)
  if (exact) return exact.expect
  const clean = path.split('?')[0]
  const found = WORKLOAD.pages.find((page) => page.path === clean)
  return found ? found.expect : null
}

/**
 * A synthetic client address per VU (RFC 2544 benchmarking range), sent as
 * the trusted proxy header, so a crowd is not one rate-limit bucket. The
 * backend under test must trust `cf-connecting-ip` (TRUSTED_PROXY=cloudflare),
 * which is how the sandbox runs.
 */
export function clientAddress() {
  // A virtual user is not one person: it runs visit after visit. Each VU
  // cycles through eight addresses so its visits are not all one household —
  // with one address per VU, member-body reads crossed the 30/min
  // per-address limit at 160 journeys/s (surge L10; recorded as a finding).
  const vu = typeof __VU === 'number' ? __VU : 0
  const iteration = typeof __ITER === 'number' ? __ITER : 0
  const slot = vu * 8 + (iteration % 8)
  return `198.18.${Math.floor(slot / 250) % 256}.${(slot % 250) + 1}`
}

function baseHeaders(extra = {}) {
  return { 'cf-connecting-ip': clientAddress(), ...extra }
}

function record(response, tags) {
  ttfb.add(response.timings.waiting, tags)
  if (response.status === 429 || response.status === 503) {
    refusals.add(1, tags)
    const retryAfter = response.headers['Retry-After']
    const valid = retryAfter !== undefined && /^\d+$/.test(String(retryAfter).trim())
    const stored = !/no-store/i.test(response.headers['Cache-Control'] || '')
    if (!valid || stored) fault('refusal_policy', { name: tags.name })
  }
}

/**
 * A page request, checked against what the manifest says that URL must
 * produce.
 *
 * For a reader, a 429 or a 503 is an outage, so it fails the check.
 * Deliberate-overload scenarios pass `{ refusalIsExpected: true }` and count
 * refusals separately.
 */
export function page(path, name = 'page', options = {}) {
  const expected = options.expect || expectationFor(path)
  const tags = {
    kind: 'page',
    name,
    signed_in: String(Boolean(options.cookie)),
    expect: String(expected ? expected.status : 'unknown'),
    ...(options.tags || {}),
  }
  const headers = baseHeaders(options.cookie ? { Cookie: options.cookie } : {})
  const response = http.get(`${CLIENT_URL}${path}`, { headers, tags, redirects: 0 })
  record(response, tags)

  if (!expected) {
    // No manifest entry: say so rather than silently checking nothing.
    check(response, { [`${name}: unexpected URL, no manifest entry`]: () => false }, tags)
    return response
  }

  const checks = {}
  checks[`${name}: status is ${expected.status}`] = (r) =>
    r.status === expected.status || (options.refusalIsExpected && (r.status === 429 || r.status === 503))

  if (expected.location) {
    checks[`${name}: redirects to ${expected.location}`] = (r) => {
      const ok = r.status !== expected.status || (r.headers['Location'] || '') === expected.location
      if (!ok) fault('wrong_content', { name })
      return ok
    }
  }

  const containsAll = [].concat(expected.contains || [])
  if (containsAll.length > 0) {
    checks[`${name}: is the expected page`] = (r) => {
      if (r.status !== 200) return r.status !== 200 && Boolean(options.refusalIsExpected)
      const body = r.body || ''
      const ok = containsAll.every((marker) => body.includes(marker))
      if (!ok) fault('wrong_content', { name })
      return ok
    }
  }

  const excludesAll = [].concat(expected.excludes || [])
  if (excludesAll.length > 0) {
    checks[`${name}: does not leak member content`] = (r) => {
      const body = r.body || ''
      const ok = !excludesAll.some((marker) => body.includes(marker))
      if (!ok) fault('privacy', { name })
      return ok
    }
  }

  if (expected.cacheable === true) {
    checks[`${name}: is publicly cacheable`] = (r) =>
      r.status !== 200 || /(^|,\s*)(public|s-maxage)/i.test(r.headers['Cache-Control'] || '')
    // A cacheable response carrying a session cookie is a shared-cache leak.
    checks[`${name}: sets no cookie on a cacheable response`] = (r) => {
      const ok = !r.headers['Set-Cookie']
      if (!ok) fault('cache_policy', { name })
      return ok
    }
  }

  if (expected.cacheable === false) {
    checks[`${name}: is not stored`] = (r) => {
      // No response at all (a timeout) has no headers to judge; the status
      // check has already failed it.
      if (r.status === 0) return true
      const ok = /no-store/i.test(r.headers['Cache-Control'] || '')
      if (!ok) fault('cache_policy', { name })
      return ok
    }
  }

  check(response, checks, tags)
  return response
}

function parse(response) {
  try {
    return response.json()
  } catch {
    return null
  }
}

/**
 * `/api/me`, checked against the exact identity this session must have.
 *
 * `label` names an identity in the workload (`identities`): its email and
 * entitlement are compared, not just "authenticated". A member whose session
 * stopped working, or who came back as somebody else, is a correctness
 * failure — the old check accepted any boolean and could report a clean
 * signed-in run that was entirely anonymous.
 */
export function identity(cookie, options = {}) {
  const declared = options.label && WORKLOAD && WORKLOAD.identities ? WORKLOAD.identities[options.label] : null
  const legacy = options.expect || identityExpectation(Boolean(cookie))
  const tags = { kind: 'dynamic', name: 'identity', signed_in: String(Boolean(cookie)), ...(options.tags || {}) }
  const headers = baseHeaders({ Origin: ORIGIN })
  if (cookie) headers.Cookie = cookie

  const response = http.get(`${BASE_URL}/api/me`, { headers, tags })
  record(response, tags)
  const body = parse(response)

  const checks = {
    'identity answered 200': (r) => r.status === 200,
    'identity is JSON': () => body !== null,
    // Private by definition. A cached /api/me is one reader seeing another's.
    'identity is never stored': (r) => {
      const ok = /no-store/i.test(r.headers['Cache-Control'] || '')
      if (!ok) fault('cache_policy', { name: 'identity' })
      return ok
    },
  }

  if (declared) {
    checks[`identity is ${options.label}`] = (r) => {
      if (r.status !== 200) return false
      const principal = body && body.principal
      const ok = declared.authenticated
        ? body.authenticated === true &&
          principal &&
          principal.email === declared.email &&
          Boolean(principal.membership && principal.membership.active) === declared.member
        : body !== null && body.authenticated === false
      if (!ok) fault('identity', { name: 'identity' })
      return ok
    }
  } else {
    for (const key of Object.keys(legacy)) {
      checks[`identity ${key} is ${legacy[key]}`] = () => {
        const ok = body !== null && body[key] === legacy[key]
        if (!ok && response.status === 200) fault('identity', { name: 'identity' })
        return ok
      }
    }
  }

  check(response, checks, tags)
  return response
}

/**
 * The members-only body of a gated piece, for a given session. A member must
 * receive the member marker; anyone else must receive a refusal and never the
 * marker.
 */
export function memberBody(piece, cookie, entitled, options = {}) {
  const tags = { kind: 'dynamic', name: 'member-body', signed_in: String(Boolean(cookie)), ...(options.tags || {}) }
  const headers = baseHeaders({ Origin: ORIGIN })
  if (cookie) headers.Cookie = cookie
  // A refusal is the correct answer for a reader who is not entitled, so it
  // does not count against availability; a 200 for them would.
  const responseCallback = entitled ? undefined : http.expectedStatuses(401, 403)
  const response = http.get(`${BASE_URL}/api/public/articles/full?type=${piece.type}&id=${piece.id}&lang=en`, {
    headers,
    tags,
    ...(responseCallback ? { responseCallback } : {}),
  })
  record(response, tags)
  const body = response.body || ''
  const leaked = !entitled && body.includes(piece.member)

  if (leaked) fault('privacy', { name: 'member-body' })
  check(
    response,
    {
      'member body: entitled reader gets it, others do not': (r) =>
        entitled ? r.status === 200 && body.includes(piece.member) : (r.status === 401 || r.status === 403) && !leaked,
      'member body is never stored': (r) => /no-store/i.test(r.headers['Cache-Control'] || ''),
    },
    tags,
  )
  if (entitled && response.status === 200 && !body.includes(piece.member)) fault('wrong_content', { name: 'member-body' })
  return response
}

/** Bookmark refs: exactly this reader's, never another's. */
export function bookmarkRefs(cookie, label, options = {}) {
  const want = (WORKLOAD && WORKLOAD.bookmarks && WORKLOAD.bookmarks[label]) || []
  const tags = { kind: 'dynamic', name: 'bookmark-refs', signed_in: String(Boolean(cookie)), ...(options.tags || {}) }
  const headers = baseHeaders({ Origin: ORIGIN })
  if (cookie) headers.Cookie = cookie
  const response = http.get(`${BASE_URL}/api/account/bookmarks/refs`, { headers, tags })
  record(response, tags)
  const body = parse(response)

  check(
    response,
    {
      'refs are exactly this reader’s': (r) => {
        if (r.status !== 200 || !body) return false
        const got = (body.refs || []).map((ref) => `${ref.targetType}:${ref.targetId}`).sort()
        const exact = JSON.stringify(got) === JSON.stringify([...want].sort())
        if (!exact) fault(got.some((key) => !want.includes(key)) ? 'privacy' : 'wrong_content', { name: 'bookmark-refs' })
        return exact
      },
      'refs are never stored': (r) => /no-store/i.test(r.headers['Cache-Control'] || ''),
    },
    tags,
  )
  return response
}

export function api(path, name, options = {}) {
  const tags = { kind: 'dynamic', name, signed_in: 'false', ...(options.tags || {}) }
  const response = http.get(`${BASE_URL}${path}`, { headers: baseHeaders(options.headers || {}), tags })
  record(response, tags)

  const checks = { [`${name} answered 200`]: (r) => r.status === 200 }
  if (options.contains) {
    checks[`${name} returned the expected body`] = (r) => {
      const ok = (r.body || '').includes(options.contains)
      if (!ok && r.status === 200) fault('wrong_content', { name })
      return ok
    }
  }
  check(response, checks, tags)
  return response
}

/** Refuse a scenario whose corpus cannot support what it claims to measure. */
export function requireCorpus(list, minimum, what) {
  if (list.length < minimum) {
    fail(`${what} needs at least ${minimum} distinct URLs; the workload supplied ${list.length}`)
  }
  return list
}
