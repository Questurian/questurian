// CAP-08 row 6 (soak half): two hours at the safe level found by the other
// rows (SAFE_READERS, default 3,000). Watch memory, pool waiting, the refresh
// backlog and error rate for drift. Run dependency-failure drills (Redis
// slow/down, database latency, rolling deploy, publish during traffic)
// during this run, one at a time, per docs/capacity/cap08-proof-matrix.md.
import { sleep } from 'k6'

import { ARTICLE_PATHS, LANDING_PATHS, gates, minutes, pick, rate } from './lib/config.js'
import { identity, page } from './lib/requests.js'

const readers = Number(__ENV.SAFE_READERS || 3000)

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-arrival-rate',
      rate: rate(readers / 180),
      timeUnit: '1s',
      duration: minutes(120),
      preAllocatedVUs: 300,
      maxVUs: 3000,
    },
  },
  thresholds: gates(),
}

export default function () {
  page(pick(LANDING_PATHS), 'landing')
  identity()
  sleep(90 * Number(__ENV.TIME_SCALE || 1))
  page(pick(ARTICLE_PATHS), 'article')
  identity()
}
