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
// unique query string defeats a shared cache in front of the backend but not
// the database's own buffers, and not the backend's request coalescing,
// which keys on the location rather than the query string. So "cold" in a
// report must mean an observed cache reset or a fresh process (surge plan
// L08), not merely an unused query string; this script measures the
// dispersed-miss case and says so.
//
// Open arrivals (surge plan L08): the old version held a constant number of
// virtual users, so a slow backend quietly lowered the offered load, and a
// run of nothing but fast 503s passed every threshold. Now arrivals are
// scheduled whatever the server does, run it under the supervisor with
// RUN_KIND=containment (refusals expected, correctness and resources still
// stop it) or RUN_KIND=capacity with SUCCESS_FLOOR_RPS, and a successful
// share is required below.
import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'

import { BASE_URL, minutes, pick, rate } from './lib/config.js'
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

const STEPS = [10, 25, 50, 100]

export const options = {
  scenarios: {
    cold: {
      executor: 'ramping-arrival-rate',
      startRate: rate(STEPS[0]),
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: Number(__ENV.MAX_VUS || 1000),
      stages: STEPS.flatMap((step) => [
        { target: rate(step), duration: minutes(0.5) },
        { target: rate(step), duration: minutes(3) },
      ]),
    },
  },
  thresholds: {
    // Controlled overload is allowed here; unexpected failures are not.
    'checks{check:no unexpected failure}': ['rate>0.999'],
    'http_req_duration{expected_response:true}': ['p(95)<1000', 'p(99)<2500'],
    // A refusal is only "controlled" if it is fast, says when to come back,
    // and is never cached. Each is thresholded: an unthresholded check can
    // fail on every request while the run reports a pass.
    'checks{check:overload is a fast refusal}': ['rate>0.99'],
    'checks{check:refusal says when to come back}': ['rate>0.999'],
    'checks{check:refusal is never cached}': ['rate>0.999'],
    // A run of nothing but fast refusals is not a capacity result.
    'checks{check:some work succeeds}': [`rate>${Number(__ENV.MIN_SUCCESS_SHARE || 0.5)}`],
    dropped_iterations: ['count<1'],
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
    'some work succeeds': (r) => r.status === 200,
  })
}
