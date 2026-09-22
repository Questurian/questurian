// The workload manifest: what this run expects to see, not just that
// something answered.
//
// The proof scripts used to check that a page was "HTML" and that identity
// was "a boolean". Both are true of a 200 that serves the wrong article, of a
// redirect to the wrong place, and of a signed-in reader who silently came
// back anonymous. A load test that cannot fail on those is not proof of
// anything except that a server was up.
//
// So every run names a manifest file, and the manifest names the exact
// response each URL must produce: status, a content marker that identifies
// the page and its revision, a redirect's exact destination, whether the
// response may be cached, and what identity the session should report. A
// missing or malformed manifest is a refusal before load starts.
//
//   WORKLOAD=./workloads/local-fake.json k6 run campaign-readers.js
//
// `open()` only works during k6's init phase, which is why this module reads
// the file at module scope.

const RAW = __ENV.WORKLOAD ? open(__ENV.WORKLOAD) : null

function fail(message) {
  throw new Error(`workload manifest: ${message}`)
}

function parse() {
  if (!RAW) return null
  let parsed
  try {
    parsed = JSON.parse(RAW)
  } catch (error) {
    fail(`${__ENV.WORKLOAD} is not valid JSON (${error.message})`)
  }
  if (parsed.version !== 1) fail(`unsupported version ${parsed.version}; this harness reads version 1`)
  if (!parsed.name) fail('needs a name, so a report can say which workload produced it')
  if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) fail('needs at least one page')

  for (const page of parsed.pages) {
    if (!page.path || !page.path.startsWith('/')) fail(`page path must start with "/" (${JSON.stringify(page.path)})`)
    const expected = page.expect || {}
    if (!expected.status) fail(`page ${page.path} must declare an expected status`)
    if (expected.status === 200 && !expected.contains) {
      fail(`page ${page.path} expects 200 but declares no content marker; "it was HTML" is not a check`)
    }
    if ([301, 302, 307, 308].includes(expected.status) && !expected.location) {
      fail(`page ${page.path} expects a redirect but declares no destination`)
    }
  }

  return parsed
}

export const WORKLOAD = parse()

/** Pages of a given kind, or every page when no kind is given. */
export function pagesOfKind(kind) {
  if (!WORKLOAD) return []
  return kind ? WORKLOAD.pages.filter((page) => page.kind === kind) : WORKLOAD.pages
}

/**
 * The cold corpus. A cold test run against three URLs measures a three-entry
 * cache, not a long tail, so the minimum is stated and enforced.
 */
export function coldPaths(minimum) {
  const paths = (WORKLOAD && WORKLOAD.cold) || []
  if (minimum && paths.length < minimum) {
    fail(`cold corpus has ${paths.length} URLs; this scenario needs at least ${minimum} distinct cold URLs`)
  }
  return paths
}

/**
 * What `/api/me` must say. Two shapes — anonymous and signed in — so a
 * signed-in run fails when the session silently stopped working, and an
 * anonymous run fails if it is ever handed a member identity.
 */
export function identityExpectation(signedIn) {
  const declared = (WORKLOAD && WORKLOAD.identity) || {}
  return signedIn ? declared.signedIn || { authenticated: true } : declared.anonymous || { authenticated: false }
}

export function describeWorkload() {
  if (!WORKLOAD) return 'no manifest (WORKLOAD unset)'
  return `${WORKLOAD.name} v${WORKLOAD.version}: ${WORKLOAD.pages.length} pages, ${((WORKLOAD.cold || []).length)} cold URLs`
}
