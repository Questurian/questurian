// CAP-08 row 2: the 100M stretch. 8,500 active readers (~47 visits/s,
// ~94 page req/s) for 10 minutes, then 5 minutes at 1,000 readers to confirm
// recovery within two minutes without a restart.
import { sleep } from 'k6'

import { ARTICLE_PATHS, LANDING_PATHS, gates, minutes, pick, rate } from './lib/config.js'
import { identity, page } from './lib/requests.js'

const visits = (readers) => rate(readers / 180)

export const options = {
  scenarios: {
    burst: {
      executor: 'ramping-arrival-rate',
      startRate: visits(1000),
      timeUnit: '1s',
      preAllocatedVUs: 300,
      maxVUs: 6000,
      stages: [
        { target: visits(8500), duration: minutes(2) },
        { target: visits(8500), duration: minutes(10) },
        { target: visits(1000), duration: minutes(1) },
        { target: visits(1000), duration: minutes(5) },
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
