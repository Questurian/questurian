// Shared settings for the CAP-08 proof matrix (docs/capacity/cap08-proof-matrix.md).
//
// Every script reads the same environment:
//   CLIENT_URL   frontend origin, e.g. https://www.questurian.com   (required)
//   BASE_URL     backend origin,  e.g. https://api.questurian.com   (required)
//   ORIGIN       Origin header a browser would send to the backend (default CLIENT_URL)
//   SCALE        multiplies every arrival rate      (default 1; 0.01 for a smoke run)
//   TIME_SCALE   multiplies every duration          (default 1; 0.02 for a smoke run)
//   URLS         comma-separated landing paths overriding the defaults below
//   SESSION_COOKIE  a real test account's cookie for the signed-in mix — supplied
//                   at run time, never committed, never a real member's
//
// Nothing here buys anything, signs anyone up or calls Stripe.

export const CLIENT_URL = required('CLIENT_URL')
export const BASE_URL = required('BASE_URL')
export const ORIGIN = __ENV.ORIGIN || CLIENT_URL
export const SCALE = Number(__ENV.SCALE || 1)
export const TIME_SCALE = Number(__ENV.TIME_SCALE || 1)

function required(name) {
  const value = __ENV[name]
  if (!value) throw new Error(`${name} is required`)
  return value.replace(/\/+$/, '')
}

/** Campaign landing pages. Replace with the campaign's real links (docs/capacity/campaign-urls.txt). */
export const LANDING_PATHS = (__ENV.URLS || '/peru/lima,/colombia/medellin,/mexico/mexico-city')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean)

export const ARTICLE_PATHS = (__ENV.ARTICLE_URLS || '/peru/lima/guides/a-beginners-guide-to-when-to-visit-lima-peru')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean)

/** A duration string scaled by TIME_SCALE, never below one second. */
export function minutes(value) {
  return `${Math.max(1, Math.round(value * 60 * TIME_SCALE))}s`
}

/** A rate scaled by SCALE, never below one per timeUnit. */
export function rate(value) {
  return Math.max(1, Math.round(value * SCALE))
}

/**
 * The CAP-08 gates. Failed requests include legitimate 429/503: for a reader,
 * a throttle is an outage. The abort rule stops escalation once unexpected
 * errors pass 1% for 60 s (evaluated after a 60 s grace).
 */
export function gates(extra = {}) {
  return {
    http_req_failed: [
      { threshold: 'rate<0.001', abortOnFail: false },
      { threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '60s' },
    ],
    'http_req_duration{kind:page}': ['p(95)<500'],
    'http_req_duration{kind:dynamic}': ['p(95)<1000', 'p(99)<2500'],
    checks: ['rate>0.999'],
    dropped_iterations: ['count<1'],
    ...extra,
  }
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}
