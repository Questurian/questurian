// CAP-08 row 4: cold and long-tail. 10 → 25 → 50 → 100 simultaneous uncached
// heavy reads against the backend, each on a distinct URL where the corpus
// allows. Overload must be controlled (fast 503 from the admission gate, no
// pool exhaustion); report the maximum sustainable throughput separately.
// RENDER_TOKEN (optional) sends the frontend's render token: these requests
// model frontend render misses, which is the traffic that bucket exists for.
// Never use it to get round a limit a reader would hit.
//
// The cold corpus is taken from the workload manifest and a minimum is
// enforced. A "cold" run against one URL measures a one-entry cache; the
// unique query string defeats the cache but not the database's own buffers,
// so a small corpus reads warm however cold the cache is.
import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'

import { BASE_URL, minutes, pick } from './lib/config.js'
import { coldPaths } from './lib/workload.js'

const MINIMUM_COLD_URLS = 25
const HEAVY_PATHS = __ENV.HEAVY_PATHS
  ? __ENV.HEAVY_PATHS.split(',').map((path) => path.trim()).filter(Boolean)
  : coldPaths(MINIMUM_COLD_URLS)

if (HEAVY_PATHS.length < MINIMUM_COLD_URLS) {
  throw new Error(
    `cold-heavy needs at least ${MINIMUM_COLD_URLS} distinct cold URLs; got ${HEAVY_PATHS.length}. ` +
      'A short list measures a warm database with a cold cache.',
  )
}

/** Refusals, counted so the report can say what share of offered work was refused. */
const refused = new Counter('cold_refusals')

export const options = {
  scenarios: Object.fromEntries(
    [10, 25, 50, 100].map((vus, index) => [
      `cold_${vus}`,
      { executor: 'constant-vus', vus, duration: minutes(3), startTime: minutes(index * 3.5) },
    ]),
  ),
  thresholds: {
    // Controlled overload is allowed here; unexpected failures are not.
    'checks{check:no unexpected failure}': ['rate>0.999'],
    'http_req_duration{expected_response:true}': ['p(95)<1000', 'p(99)<2500'],
    // A refusal is only "controlled" if it is fast. Unthresholded, this check
    // could fail on every request and the run still reported a pass, because
    // nothing required the check rate to be anything in particular.
    'checks{check:overload is a fast refusal}': ['rate>0.99'],
  },
}

export default function () {
  // A unique query string defeats any shared cache in front of the backend.
  const path = `${pick(HEAVY_PATHS)}?cold=${__VU}-${__ITER}-${Date.now()}`
  const headers = __ENV.RENDER_TOKEN ? { 'x-questura-render-token': __ENV.RENDER_TOKEN } : {}
  const response = http.get(`${BASE_URL}${path}`, { headers, tags: { kind: 'dynamic', name: 'cold-heavy' } })
  if (response.status === 503 || response.status === 429) refused.add(1)

  check(response, {
    'no unexpected failure': (r) => r.status === 200 || r.status === 503,
    'overload is a fast refusal': (r) => r.status !== 503 || r.timings.duration < 2000,
    // A refusal a CDN or a client can act on. A 503 with no Retry-After is a
    // refusal that turns into a synchronised retry storm.
    'refusal says when to come back': (r) => r.status !== 503 || Boolean(r.headers['Retry-After']),
    'refusal is never cached': (r) => r.status !== 503 || /no-store/i.test(r.headers['Cache-Control'] || ''),
  })
}
