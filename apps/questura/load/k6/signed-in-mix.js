// CAP-08 row 5: private and cheap dynamic reads. Anonymous identity at the
// modelled arrival rate, plus a signed-in share (1%, 10%, 25% of visits)
// sending SESSION_COOKIE: a dedicated test account's cookie, supplied at run
// time. Then ramp cheap identity toward 500 req/s if the prior stages held.
//
// The cookie is required, not optional. Without it every "signed-in" request
// was anonymous and the run reported a clean pass for a request class it
// never exercised — and the signed-in path is the expensive one.
import { ARTICLE_PATHS, LANDING_PATHS, gates, minutes, pick, rate, signedInShare } from './lib/config.js'
import { identity, page } from './lib/requests.js'

const COOKIE = __ENV.SESSION_COOKIE || ''
const SHARES = [0.01, 0.1, 0.25]

// Init-time refusal: fail before load, not after twenty minutes of it.
SHARES.forEach((share) => signedInShare(share))

export const options = {
  scenarios: {
    ...Object.fromEntries(
      SHARES.map((share, index) => [
        `signed_in_${Math.round(share * 100)}pct`,
        {
          executor: 'constant-arrival-rate',
          rate: rate(34),
          timeUnit: '1s',
          duration: minutes(5),
          startTime: minutes(index * 5.5),
          preAllocatedVUs: 100,
          maxVUs: 1000,
          env: { SIGNED_IN_SHARE: String(share) },
        },
      ]),
    ),
    identity_ramp: {
      executor: 'ramping-arrival-rate',
      startRate: rate(50),
      timeUnit: '1s',
      startTime: minutes(17),
      preAllocatedVUs: 100,
      maxVUs: 2000,
      exec: 'identityOnly',
      stages: [
        { target: rate(250), duration: minutes(3) },
        { target: rate(500), duration: minutes(3) },
        { target: rate(500), duration: minutes(5) },
      ],
    },
  },
  thresholds: gates({
    // Signed-in and anonymous outcomes are tagged apart: a pass that averaged
    // the two would hide the expensive class behind the cheap one.
    'checks{signed_in:true}': ['rate>0.999'],
    'checks{signed_in:false}': ['rate>0.999'],
  }),
}

export default function () {
  const signedIn = Boolean(COOKIE) && Math.random() < Number(__ENV.SIGNED_IN_SHARE || 0)
  const tags = { signed_in: String(signedIn) }
  page(pick([...LANDING_PATHS, ...ARTICLE_PATHS]), 'page', { tags })
  identity(signedIn ? COOKIE : undefined, { tags })
}

export function identityOnly() {
  identity(undefined, { tags: { signed_in: 'false' } })
}
