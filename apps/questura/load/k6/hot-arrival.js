// CAP-08 row 3: arrival-rate headroom on prewarmed pages. 100 → 250 → 500 →
// 1,000 page requests/s, five minutes each, one request per iteration.
// Distinct from reader counts. Escalation stops on the abort threshold, and
// the highest healthy level is the measured ceiling.
import { ARTICLE_PATHS, LANDING_PATHS, gates, minutes, pick, rate } from './lib/config.js'
import { page } from './lib/requests.js'

const LEVELS = [100, 250, 500, 1000]

export const options = {
  scenarios: {
    hot: {
      executor: 'ramping-arrival-rate',
      startRate: rate(LEVELS[0]),
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 3000,
      stages: LEVELS.flatMap((level) => [
        { target: rate(level), duration: minutes(1) },
        { target: rate(level), duration: minutes(5) },
      ]),
    },
  },
  thresholds: gates(),
}

const PATHS = [...LANDING_PATHS, ...ARTICLE_PATHS]

export default function () {
  page(pick(PATHS), 'hot')
}
