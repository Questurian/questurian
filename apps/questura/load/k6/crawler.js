// A crawler walking the sitemap beside ordinary readers (launch fix plan
// item 9; go-live stage S7: 2/s over distinct sitemap URLs for 10 min beside
// 10 readers/s, 0 refusals, readers' p95 no more than 20% above baseline).
//
// The crawler asks for each URL in /sitemap.xml once, in order, and wraps
// only when it has asked for all of them; the run reports how many distinct
// URLs it covered. Every crawled page must answer 200 (the sitemap lists only
// pages that exist), must not be a refusal, and must not carry any member
// marker from the manifest. Readers are the free-landing journey (page,
// anonymous identity, bookmark refs), tagged `journey:reader` so their
// latency can be compared with a run without the crawler.
//
//   WORKLOAD=workloads/launch-local.json CRAWL_RATE=2 READER_RATE=10 DURATION=60s \
//   node supervise.mjs crawler.js
//
// A crawler is one address, which is what a real one is: CRAWLER_ADDRESS
// (default 198.18.255.1), signed as a load identity when LOAD_TEST_KEY is set
// so that through Cloudflare it is still its own address, not the
// generator's shared with every reader.

import http from 'k6/http'
import { check } from 'k6'
import exec from 'k6/execution'
import { Counter } from 'k6/metrics'

import { CLIENT_URL, gates, pick } from './lib/config.js'
import { addressHeaders, bookmarkRefs, identity, page } from './lib/requests.js'
import { WORKLOAD } from './lib/workload.js'

if (!WORKLOAD || WORKLOAD.version !== 2) throw new Error('crawler needs a version 2 workload (node lib/build-launch-workload.mjs)')

const CRAWL_RATE = Number(__ENV.CRAWL_RATE || 2)
const READER_RATE = Number(__ENV.READER_RATE || 10)
const DURATION = __ENV.DURATION || '60s'
const CRAWLER_ADDRESS = __ENV.CRAWLER_ADDRESS || '198.18.255.1'
if (!(CRAWL_RATE > 0) || !(READER_RATE > 0)) throw new Error('CRAWL_RATE and READER_RATE must be positive numbers')

const MEMBER_MARKERS = (WORKLOAD.gated || []).map((piece) => piece.member)
const free = WORKLOAD.pages.filter((entry) => entry.kind === 'article' && entry.access === 'free')
const landings = WORKLOAD.pages.filter((entry) => entry.kind === 'landing')

/** Crawled URLs that were refused (429/503): an assembly refusal is a failure for a crawler too. */
export const crawlRefusals = new Counter('questura_crawl_refusals')

export const options = {
  scenarios: {
    crawler: { executor: 'constant-arrival-rate', rate: CRAWL_RATE, timeUnit: '1s', duration: DURATION, preAllocatedVUs: 5, maxVUs: 50, exec: 'crawl' },
    readers: { executor: 'constant-arrival-rate', rate: READER_RATE, timeUnit: '1s', duration: DURATION, preAllocatedVUs: 20, maxVUs: 200, exec: 'read' },
  },
  thresholds: gates({
    questura_crawl_refusals: ['count<1'],
    // Named so they are reported apart: readers beside a crawler, and the crawl.
    'http_req_duration{journey:reader,kind:page,expected_response:true}': ['p(95)<500'],
    'http_req_duration{journey:crawler,kind:page,expected_response:true}': ['p(95)<500'],
    'checks{journey:crawler}': ['rate>0.999'],
  }),
}

/** Paths from the site's own sitemap, on the site's own host only. */
export function setup() {
  const response = http.get(`${CLIENT_URL}/sitemap.xml`, { tags: { kind: 'page', name: 'sitemap', journey: 'crawler' } })
  if (response.status !== 200) throw new Error(`/sitemap.xml answered ${response.status}`)
  const paths = []
  for (const match of String(response.body).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const url = match[1].replace(/&amp;/g, '&')
    const path = url.replace(/^https?:\/\/[^/]+/, '')
    if (path.startsWith('/') && !paths.includes(path)) paths.push(path)
  }
  if (paths.length === 0) throw new Error('/sitemap.xml lists no URLs')
  return { paths }
}

/** A redirect target on this site: a path, or an absolute URL on the site's own host. */
function sameSite(location) {
  if (!location) return false
  if (location.startsWith('/') && !location.startsWith('//')) return true
  const host = (url) => (/^https?:\/\/([^/]+)/.exec(url) || [])[1]
  return host(location) !== undefined && host(location) === host(CLIENT_URL)
}

export function crawl(data) {
  const tags = { journey: 'crawler' }
  const path = data.paths[exec.scenario.iterationInTest % data.paths.length]
  const response = http.get(`${CLIENT_URL}${path}`, {
    headers: { ...addressHeaders(CRAWLER_ADDRESS), 'user-agent': 'questura-load-crawler' },
    tags: { kind: 'page', name: 'crawl', ...tags },
    redirects: 0,
  })
  if (response.status === 429 || response.status === 503) crawlRefusals.add(1)
  check(
    response,
    {
      // The sitemap lists `/`, which redirects to the default city: a crawler
      // follows that, so a redirect that stays on the site is an answer.
      'crawled page answers 200, or redirects within the site': (r) =>
        r.status === 200 || ([301, 302, 307, 308].includes(r.status) && sameSite(r.headers['Location'])),
      'crawled page carries no member marker': (r) => !MEMBER_MARKERS.some((marker) => (r.body || '').includes(marker)),
    },
    tags,
  )
}

export function read() {
  const tags = { journey: 'reader' }
  const landing = Math.random() < 0.3 ? pick(landings) : pick(free)
  page(landing.path, landing.kind, { tags })
  identity(undefined, { label: 'anonymous', tags })
  bookmarkRefs(undefined, 'anonymous', { tags })
}

export function teardown(data) {
  const covered = Math.min(data.paths.length, Math.round(CRAWL_RATE * (Number.parseInt(DURATION, 10) * (DURATION.endsWith('m') ? 60 : 1))))
  console.log(`crawler: sitemap lists ${data.paths.length} URLs; this run asked for about ${covered} distinct ones`)
}
