// CAP-08 row 4: cold and long-tail. 10 → 25 → 50 → 100 simultaneous uncached
// heavy reads against the backend, each on a distinct URL where the corpus
// allows. Overload must be controlled (fast 503 from the admission gate, no
// pool exhaustion); report the maximum sustainable throughput separately.
// Supply HEAVY_PATHS with many distinct curated pages for a real long tail.
// RENDER_TOKEN (optional) sends the frontend's render token: these requests
// model frontend render misses, which is the traffic that bucket exists for.
// Never use it to get round a limit a reader would hit.
import http from 'k6/http'
import { check } from 'k6'

import { BASE_URL, minutes, pick } from './lib/config.js'

const HEAVY_PATHS = (__ENV.HEAVY_PATHS || '/api/public/location-homepages/peru/lima')
  .split(',')
  .map((path) => path.trim())

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
  },
}

export default function () {
  // A unique query string defeats any shared cache in front of the backend.
  const path = `${pick(HEAVY_PATHS)}?cold=${__VU}-${__ITER}-${Date.now()}`
  const headers = __ENV.RENDER_TOKEN ? { 'x-questura-render-token': __ENV.RENDER_TOKEN } : {}
  const response = http.get(`${BASE_URL}${path}`, { headers, tags: { kind: 'dynamic', name: 'cold-heavy' } })
  check(response, {
    'no unexpected failure': (r) => r.status === 200 || r.status === 503,
    'overload is a fast refusal': (r) => r.status !== 503 || r.timings.duration < 2000,
  })
}
