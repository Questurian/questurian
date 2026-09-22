// Shared settings for the CAP-08 proof matrix (docs/capacity/cap08-proof-matrix.md).
//
// Every script reads the same environment:
//   WORKLOAD     path to a workload manifest (lib/workload.js). Required for
//                any run whose result will be reported as evidence.
//   CLIENT_URL   frontend origin, e.g. https://www.questurian.com   (required)
//   BASE_URL     backend origin,  e.g. https://api.questurian.com   (required)
//   ORIGIN       Origin header a browser would send to the backend (default CLIENT_URL)
//   SCALE        multiplies every arrival rate      (default 1; 0.01 for a smoke run)
//   TIME_SCALE   multiplies every duration          (default 1; 0.02 for a smoke run)
//   URLS         comma-separated landing paths overriding the manifest
//   SESSION_COOKIE  a real test account's cookie for the signed-in mix — supplied
//                   at run time, never committed, never a real member's
//
// Nothing here buys anything, signs anyone up or calls Stripe.
//
// Every one of these is validated at init. An unparseable SCALE used to
// become `NaN`, which k6 rounds to a rate of 1 and reports as a clean pass:
// the run "succeeded" at a thousandth of the intended load. A run that
// cannot state what it offered cannot state what was achieved.

import { WORKLOAD } from './workload.js'

export const CLIENT_URL = requiredUrl('CLIENT_URL', WORKLOAD && WORKLOAD.client)
export const BASE_URL = requiredUrl('BASE_URL', WORKLOAD && WORKLOAD.backend)
export const ORIGIN = __ENV.ORIGIN || CLIENT_URL
export const SCALE = positiveNumber('SCALE', 1)
export const TIME_SCALE = positiveNumber('TIME_SCALE', 1)

function requiredUrl(name, fallback) {
  const value = __ENV[name] || fallback
  if (!value) throw new Error(`${name} is required (set it, or name it in the workload manifest)`)
  return String(value).replace(/\/+$/, '')
}

function positiveNumber(name, fallback) {
  const raw = __ENV[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!isFinite(value) || value <= 0) {
    throw new Error(`${name}=${raw} is not a positive finite number. A silent NaN makes a run report load it never offered.`)
  }
  return value
}

function pathList(name, fromEnv, fallback) {
  const list = (fromEnv ? String(fromEnv).split(',') : fallback || [])
    .map((path) => String(path).trim())
    .filter(Boolean)
  if (list.length === 0) throw new Error(`${name} is empty. Name the URLs this run is about.`)
  const wrong = list.find((path) => !path.startsWith('/'))
  if (wrong) throw new Error(`${name} entry must start with "/": ${wrong}`)
  return list
}

const manifestPages = (WORKLOAD && WORKLOAD.pages) || []

/** Campaign landing pages. The manifest is the source; URLS overrides it. */
export const LANDING_PATHS = pathList(
  'URLS',
  __ENV.URLS,
  manifestPages.filter((page) => page.kind === 'landing').map((page) => page.path),
)

export const ARTICLE_PATHS = pathList(
  'ARTICLE_URLS',
  __ENV.ARTICLE_URLS,
  manifestPages.filter((page) => page.kind === 'article').map((page) => page.path),
)

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
 * a throttle is an outage.
 *
 * The abort threshold is **cumulative**, not rolling. k6 thresholds are
 * evaluated over the whole run so far, so `rate<0.01 delayAbortEval=60s` means
 * "stop once total failures since the start exceed 1%, and do not look before
 * 60 s" — which is a weaker and slower stop than the sixty-second window the
 * proof matrix asks for. A long healthy run dilutes a sharp failure and the
 * abort never fires. `supervise.mjs` is the rolling-window stop; run through
 * it, not bare k6, for anything billed.
 */
export function gates(extra = {}) {
  return {
    http_req_failed: [
      { threshold: 'rate<0.001', abortOnFail: false },
      // Cumulative since the run started. See supervise.mjs for the window.
      { threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '60s' },
    ],
    'http_req_duration{kind:page}': ['p(95)<500'],
    'http_req_duration{kind:dynamic}': ['p(95)<1000', 'p(99)<2500'],
    checks: ['rate>0.999'],
    dropped_iterations: ['count<1'],
    ...extra,
  }
}

/**
 * The signed-in share, refusing to pretend. A scenario that declares a
 * nonzero signed-in share and has no session cookie used to run happily and
 * report a clean pass for traffic that was entirely anonymous — the most
 * expensive request class in the matrix, silently untested.
 */
export function signedInShare(share) {
  const value = Number(share || 0)
  if (value > 0 && !__ENV.SESSION_COOKIE) {
    throw new Error(
      `this scenario models ${Math.round(value * 100)}% signed-in traffic and SESSION_COOKIE is not set. ` +
        'Supply a synthetic session or set the share to 0; a missing cookie makes every request anonymous.',
    )
  }
  return value
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}
