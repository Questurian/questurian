// The probe the supervisor-level negative controls run: open arrivals over a
// landing page, an article, a public API read and identity, with no k6
// thresholds of its own — the supervisor alone decides whether the run stops
// and why. Each control in run.mjs points it at a fake target that is broken
// in one specific way and asserts the supervisor's exit code.
import { ARTICLE_PATHS, LANDING_PATHS, pick } from '../lib/config.js'
import { api, identity, page } from '../lib/requests.js'

export const options = {
  scenarios: {
    probe: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.PROBE_RATE || 20),
      timeUnit: '1s',
      duration: __ENV.PROBE_DURATION || '20s',
      preAllocatedVUs: Number(__ENV.PROBE_VUS || 10),
      maxVUs: Number(__ENV.PROBE_VUS || 10),
    },
  },
}

export default function () {
  page(pick(LANDING_PATHS), 'landing')
  page(pick(ARTICLE_PATHS), 'article')
  api('/api/public/articles/search?q=lima', 'public-api')
  identity(__ENV.PROBE_SIGNED_IN ? 'session=synthetic-member' : undefined)
}
