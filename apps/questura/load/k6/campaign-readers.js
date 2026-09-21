// CAP-08 row 1: the campaign reader mix.
// Ramp 100 → 1,000 → 3,000 → 6,000 active readers (180 s visits, two pages,
// the identity check after each), then sustain 30 minutes.
// Active readers = visits/s × 180 s, so 6,000 readers ≈ 33.3 visits/s ≈ 67 page req/s.
import { sleep } from 'k6'

import { ARTICLE_PATHS, LANDING_PATHS, gates, minutes, pick, rate } from './lib/config.js'
import { identity, page } from './lib/requests.js'

const visits = (readers) => rate(readers / 180)

export const options = {
  scenarios: {
    readers: {
      executor: 'ramping-arrival-rate',
      startRate: visits(100),
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 4000,
      stages: [
        { target: visits(1000), duration: minutes(5) },
        { target: visits(3000), duration: minutes(5) },
        { target: visits(6000), duration: minutes(5) },
        { target: visits(6000), duration: minutes(30) },
      ],
    },
  },
  thresholds: gates(),
}

export default function () {
  page(`${pick(LANDING_PATHS)}?utm_source=campaign`, 'landing')
  identity()
  sleep(90 * Number(__ENV.TIME_SCALE || 1))
  page(pick(ARTICLE_PATHS), 'article')
  identity()
}
