// A viral spike on ONE free article, through the site (launch fix plan item 9;
// go-live stage S6: 50/s on one article, edge HIT >= 99%, page p95 <= 300 ms).
//
// Every visitor lands on the same page and does what a real visit does: the
// page, then the anonymous identity check and bookmark refs from the browser.
// The page must come from cache, not from a fresh render per reader: the
// share served as a cache hit is `questura_page_cache_hit`, read from
// Cloudflare's `cf-cache-status` when present, else Next's `x-nextjs-cache`.
// How many render calls reached the API for that path is not visible to k6:
// the local driver (runs/local-matrix.mjs) reads it from the sandbox edge's
// counters, and on the platform it is the API's request log for the path.
//
//   WORKLOAD=workloads/launch-local.json RATE=50 DURATION=60s \
//   node supervise.mjs viral-article.js
//
// Env: RATE (visits/s, default 50), DURATION (default 60s), VIRAL_PATH (a
// free article in the manifest; default the first one), MAX_VUS (default 400).

import { Rate } from 'k6/metrics'

import { gates } from './lib/config.js'
import { bookmarkRefs, identity, page } from './lib/requests.js'
import { WORKLOAD } from './lib/workload.js'

if (!WORKLOAD || WORKLOAD.version !== 2) throw new Error('viral-article needs a version 2 workload (node lib/build-launch-workload.mjs)')

const free = WORKLOAD.pages.filter((entry) => entry.kind === 'article' && entry.access === 'free')
const VIRAL = __ENV.VIRAL_PATH ? free.find((entry) => entry.path === __ENV.VIRAL_PATH) : free[0]
if (!VIRAL) throw new Error(`VIRAL_PATH=${__ENV.VIRAL_PATH} is not a free article in the workload`)

/** Pages served from a cache (HIT), out of all page answers. STALE counts as a miss: it asks the API. */
export const cacheHit = new Rate('questura_page_cache_hit')

const RATE = Number(__ENV.RATE || 50)
const MAX_VUS = Number(__ENV.MAX_VUS || 400)
if (!(RATE > 0) || !(MAX_VUS > 0)) throw new Error('RATE and MAX_VUS must be positive numbers')

export const options = {
  scenarios: {
    viral: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: __ENV.DURATION || '60s',
      preAllocatedVUs: Math.min(100, MAX_VUS),
      maxVUs: MAX_VUS,
    },
  },
  thresholds: gates({
    'http_req_duration{kind:page,expected_response:true}': ['p(95)<300'],
    questura_page_cache_hit: ['rate>=0.99'],
  }),
}

export function cacheStatus(response) {
  const edge = response.headers['Cf-Cache-Status']
  if (edge) return String(edge).toUpperCase()
  return String(response.headers['X-Nextjs-Cache'] || 'NONE').toUpperCase()
}

export default function () {
  const tags = { journey: 'viral' }
  const response = page(VIRAL.path, 'viral', { tags })
  if (response.status === 200) cacheHit.add(cacheStatus(response) === 'HIT', { path: VIRAL.path })
  identity(undefined, { label: 'anonymous', tags })
  bookmarkRefs(undefined, 'anonymous', { tags })
}
