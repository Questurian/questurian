// Browser-informed visitor journeys against the launch corpus (surge plan L08/L10).
//
// Open arrivals: journeys start on a schedule whatever the server does, so a
// slow server shows up as latency and refusals, not as a quietly lower
// offered load. Each journey is what a real visit to that kind of page asks
// for, from the request map in the discovery report:
//
//   free landing   HTML + anonymous /api/me + anonymous bookmark refs
//   gated member   HTML + member /api/me + refs + the member body
//   gated reader   HTML + non-member /api/me + a refused member body
//   repeat visit   HTML only (identity and refs already held client-side)
//   search         a submitted search, with results or an explicit empty state
//   saved items    member refs + the saved-items list
//   bookmark write signed-in add then delete — its own scenario, WRITE_RATE/s
//   sign-in        the real sign-in endpoint — its own scenario, SIGNIN_RATE/s
//
// Every response is checked exactly (lib/requests.js); every correctness
// failure is `questura_correctness{class}`, which the supervisor stops on.
// Sessions come from SESSIONS_FILE (pnpm readiness:sessions) — distinct
// sessions per identity, distinct synthetic client address per VU.
//
//   WORKLOAD=workloads/launch-local.json SESSIONS_FILE=$TMPDIR/questura-readiness/sessions.json \
//   RATE=5 DURATION=60s node supervise.mjs launch-journeys.js
//
// Env: RATE (journeys/s, default 5), DURATION (default 60s), STAGES
// (comma list of rate:duration for a step profile, overrides RATE/DURATION),
// MAX_VUS (default 200). Nothing here pays, mails or signs anyone up.

import http from 'k6/http'
import { check } from 'k6'

import { BASE_URL, ORIGIN, gates, pick } from './lib/config.js'
import { bookmarkRefs, clientAddress, identity, memberBody, page } from './lib/requests.js'
import { WORKLOAD } from './lib/workload.js'

if (!WORKLOAD || WORKLOAD.version !== 2) throw new Error('launch-journeys needs a version 2 workload (node lib/build-launch-workload.mjs)')
if (!__ENV.SESSIONS_FILE) throw new Error('SESSIONS_FILE is required: run `pnpm readiness:sessions` and pass the path it prints')

// `{ label: [cookie, …] }`: several sessions per identity, so the crowd is
// many readers. Each VU keeps one session per identity for the whole run.
const POOLS = JSON.parse(open(__ENV.SESSIONS_FILE))
for (const label of ['member-a', 'member-b', 'nonmember']) {
  if (!Array.isArray(POOLS[label]) || POOLS[label].length === 0) throw new Error(`SESSIONS_FILE has no sessions for ${label}`)
}
const SESSIONS = new Proxy(
  {},
  { get: (_target, label) => (POOLS[label] ? POOLS[label][(typeof __VU === 'number' ? __VU : 0) % POOLS[label].length] : undefined) },
)

// EXCLUDE_PATHS: pages another process is deliberately changing during this
// run (publication under load), so their exact-content checks are not
// mistaken for a regression.
const EXCLUDED = new Set((__ENV.EXCLUDE_PATHS || '').split(',').map((path) => path.trim()).filter(Boolean))
const pages = WORKLOAD.pages.filter((entry) => !EXCLUDED.has(entry.path))
const free = pages.filter((entry) => entry.kind === 'article' && entry.access === 'free')
const landings = pages.filter((entry) => entry.kind === 'landing')
const searches = pages.filter((entry) => entry.kind === 'search')
const gated = WORKLOAD.gated.filter((entry) => !EXCLUDED.has(entry.path))
const gatedPages = pages.filter((entry) => entry.kind === 'article' && entry.access === 'member')

function positive(name, fallback) {
  const raw = __ENV[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!isFinite(value) || value <= 0) throw new Error(`${name}=${raw} must be a positive number`)
  return value
}

const RATE = positive('RATE', 5)
const MAX_VUS = positive('MAX_VUS', 200)
const STAGES = (__ENV.STAGES || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [target, duration] = entry.split(':')
    if (!(Number(target) >= 0) || !/^\d+[sm]$/.test(duration || '')) throw new Error(`STAGES entry "${entry}" must be <rate>:<duration>`)
    return { target: Number(target), duration }
  })

// Writes and sign-ins are rare and belong to people, not to a crowd share:
// scaled with the crowd, one synthetic account's bookmark writes passed the
// 60/min per-account limit at 20 journeys/s and the limit refused them —
// correctly. They run as their own fixed, low-rate scenarios instead.
const WRITE_RATE = Number(__ENV.WRITE_RATE || 0.4)
const SIGNIN_RATE = Number(__ENV.SIGNIN_RATE || 0.1)
const RATE_DURATION = __ENV.DURATION || (STAGES.length ? STAGES.reduce((sum, stage) => sum + parseInt(stage.duration, 10) * (stage.duration.endsWith('m') ? 60 : 1), 0) + 's' : '60s')

export const options = {
  scenarios: {
    writes: { executor: 'constant-arrival-rate', rate: Math.max(1, Math.round(WRITE_RATE * 10)), timeUnit: '10s', duration: RATE_DURATION, preAllocatedVUs: 2, maxVUs: 10, exec: 'bookmarkWrite' },
    signins: { executor: 'constant-arrival-rate', rate: Math.max(1, Math.round(SIGNIN_RATE * 10)), timeUnit: '10s', duration: RATE_DURATION, preAllocatedVUs: 2, maxVUs: 10, exec: 'signIn' },
    journeys: STAGES.length
      ? { executor: 'ramping-arrival-rate', startRate: STAGES[0].target, timeUnit: '1s', stages: STAGES, preAllocatedVUs: Math.min(Number(__ENV.PRE_VUS || 50), MAX_VUS), maxVUs: MAX_VUS }
      : { executor: 'constant-arrival-rate', rate: RATE, timeUnit: '1s', duration: __ENV.DURATION || '60s', preAllocatedVUs: Math.min(Number(__ENV.PRE_VUS || 50), MAX_VUS), maxVUs: MAX_VUS },
  },
  thresholds: gates(),
}

const JOURNEYS = [
  ['free-landing', 40],
  ['gated-member', 12],
  ['gated-reader', 14],
  ['repeat-visit', 12],
  ['search', 8],
  ['saved-items', 8],
]
const TOTAL = JOURNEYS.reduce((sum, [, weight]) => sum + weight, 0)

function chooseJourney() {
  let roll = Math.random() * TOTAL
  for (const [name, weight] of JOURNEYS) {
    roll -= weight
    if (roll < 0) return name
  }
  return JOURNEYS[0][0]
}

function member() {
  return pick(['member-a', 'member-b'])
}

export default function () {
  const journey = chooseJourney()
  const tags = { journey }

  if (journey === 'free-landing') {
    const landing = Math.random() < 0.3 ? pick(landings) : pick(free)
    page(landing.path, landing.kind, { tags })
    identity(undefined, { label: 'anonymous', tags })
    bookmarkRefs(undefined, 'anonymous', { tags })
    return
  }

  if (journey === 'gated-member') {
    const label = member()
    const cookie = SESSIONS[label]
    const target = pick(gated)
    page(target.path, 'article', { tags })
    identity(cookie, { label, tags })
    bookmarkRefs(cookie, label, { tags })
    memberBody(target, cookie, true, { tags })
    return
  }

  if (journey === 'gated-reader') {
    const signedIn = Math.random() < 0.5
    const label = signedIn ? 'nonmember' : 'anonymous'
    const cookie = signedIn ? SESSIONS.nonmember : undefined
    const target = pick(gated)
    page(target.path, 'article', { tags })
    identity(cookie, { label, tags })
    // The client asks for the body only for a member; a reader who probes it
    // anyway must be refused without the member marker.
    if (Math.random() < 0.2) memberBody(target, cookie, false, { tags })
    return
  }

  if (journey === 'repeat-visit') {
    const target = pick([...free, ...gatedPages])
    page(target.path, 'article', { tags })
    return
  }

  if (journey === 'search') {
    const target = pick(searches)
    page(target.path, 'search', { tags })
    return
  }

  if (journey === 'saved-items') {
    const label = member()
    const cookie = SESSIONS[label]
    bookmarkRefs(cookie, label, { tags })
    const response = http.get(`${BASE_URL}/api/account/bookmarks?page=1&pageSize=20`, {
      headers: { Origin: ORIGIN, Cookie: cookie, 'cf-connecting-ip': clientAddress() },
      tags: { kind: 'dynamic', name: 'bookmark-list', signed_in: 'true', ...tags },
    })
    check(response, { 'saved items answered 200': (r) => r.status === 200 }, tags)
    return
  }

}

export function bookmarkWrite() {
  const tags = { journey: 'bookmark-write' }
  {
    // Add then remove a bookmark as the signed-in non-member: bookmarks need
    // a session, not a membership, and no other journey checks this reader's
    // exact set — a member's write would race the exact-refs checks and read
    // as a leak. The write limit (60/min per account) is part of the system
    // under test; a 429 here is recorded as a refusal, not hidden.
    const cookie = SESSIONS.nonmember
    const target = pick(free)
    const headers = { Origin: ORIGIN, Cookie: cookie, 'cf-connecting-ip': clientAddress(), 'content-type': 'application/json' }
    const writeTags = { kind: 'dynamic', name: 'bookmark-write', signed_in: 'true', ...tags }
    const add = http.post(`${BASE_URL}/api/account/bookmarks`, JSON.stringify({ targetType: target.type, targetId: target.id }), { headers, tags: writeTags })
    const remove = http.del(`${BASE_URL}/api/account/bookmarks?targetType=${target.type}&targetId=${target.id}`, null, { headers, tags: writeTags })
    check(add, { 'bookmark add accepted or explicitly limited': (r) => r.status === 200 || r.status === 429 }, writeTags)
    check(remove, { 'bookmark remove accepted or explicitly limited': (r) => r.status === 200 || r.status === 429 }, writeTags)
  }
}


export function signIn() {
  const tags = { journey: 'sign-in' }
  {
    const response = http.post(
      `${BASE_URL}/api/visitor-auth/sign-in/email`,
      JSON.stringify({ email: WORKLOAD.identities.nonmember.email, password: __ENV.SYNTHETIC_PASSWORD || 'Readiness-Synthetic-2026!' }),
      {
        headers: { Origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': clientAddress() },
        tags: { kind: 'dynamic', name: 'sign-in', signed_in: 'false', ...tags },
      },
    )
    // A failed sign-in is an availability failure, not a wrong answer: during
    // a Redis stall Better Auth cannot write the session and answers 500
    // (surge L10). Counted by the check and http_req_failed, not as correctness.
    check(response, { 'sign-in succeeds or is explicitly limited': (r) => r.status === 200 || r.status === 429 || r.status === 503 }, tags)
  }
}
