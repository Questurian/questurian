#!/usr/bin/env node
// The finite local run matrix for the launch corpus (surge plan L10).
//
//   pnpm --dir apps/questura/apps/server readiness:stack -- up
//   node apps/questura/load/k6/runs/local-matrix.mjs [scenario ...]
//
// Every scenario runs under the supervisor (exact stop reasons) against the
// sandbox stack, with its envelope declared below *before* it starts. Beside
// k6, this driver samples once a second: a probe reader (one free article
// page and one anonymous identity), every gate/pool counter from the
// backend's db-stats, and the backend process's resident memory. Faults are
// injected one at a time, and recovery is the time from removing the fault
// until the probe succeeds for five consecutive seconds.
//
// Output: docs/capacity/runs/<MATRIX_RUN>/<scenario>.json (default
// MATRIX_RUN=2026-09-22-surge-L10), one file per scenario, with the envelope,
// the supervisor summary, k6's per-class latency, the samples and the
// recovery time. No cookie and no key is ever written.
//
// Launch fix plan item 9 added: the viral article, the crawler, a 2%
// signed-in share, a cold start (the stack's apps restarted, then 10
// journeys/s at once), and the one-caller problem through an edge that
// overwrites CF-Connecting-IP as Cloudflare does, with and without the load
// identity. The load-identity scenarios need the stack started with
// `--load-test-window <minutes>`; they refuse to run otherwise.
//
// This describes this Mac, this build and this workload. It is not a
// capacity figure for any hosted platform.

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const K6 = resolve(here, '..')
const SERVER = resolve(here, '../../../apps/server')
const RUN_NAME = process.env.MATRIX_RUN || '2026-09-22-surge-L10'
if (!/^[\w.-]+$/.test(RUN_NAME)) throw new Error(`MATRIX_RUN=${RUN_NAME} must be a plain folder name`)
const OUT = resolve(here, '../../../docs/capacity/runs', RUN_NAME)
const STATE = resolve(tmpdir(), 'questura-readiness')
const readStack = () => JSON.parse(readFileSync(resolve(STATE, 'stack.json'), 'utf8'))
let stack = readStack()
const manifest = JSON.parse(readFileSync(resolve(K6, 'manifests/launch-v1.json'), 'utf8'))
const BACKEND = `http://127.0.0.1:${stack.ports.backend}`
const CLIENT = `http://127.0.0.1:${stack.ports.client}`
const pidOf = (role) => stack.processes.find((entry) => entry.role === role).pid
// The sandbox database, never the default port: 5432 on a development
// machine is somebody's real database.
const SANDBOX_DB = process.env.READINESS_DATABASE_URI || 'postgres://postgres@127.0.0.1:5442/questura_readiness'
const probePiece = manifest.pieces.find((piece) => piece.type === 'articles' && piece.index === 22)

/** The envelope, declared before anything runs. */
const ENVELOPE = {
  maxRequestsPerRun: 60_000,
  maxRunMs: 5 * 60_000,
  maxBackendRssMb: 3_000,
  queueSustainMs: 10_000,
  telemetryGapMs: 5_000,
  recoveryDeadlineMs: 60_000,
  provisionalThresholds: 'page p95 < 500 ms, dynamic p95 < 1 s, page TTFB p95 < 400 ms (successful requests only)',
  note: 'Local regression thresholds on one Mac, not product promises.',
}

const PUBLICATION_PATHS = [8, 10, 12, 14, 16, 20, 24].map(
  (index) => manifest.pieces.find((piece) => piece.type === 'articles' && piece.index === index).path,
)

const SCENARIOS = {
  calibrate: { kind: 'correctness', env: { RATE: '5', DURATION: '60s' }, note: 'low plateau: counters and generator trusted' },
  'plateau-10': { kind: 'capacity', env: { RATE: '10', DURATION: '60s' }, floor: 15 },
  'plateau-20': { kind: 'capacity', env: { RATE: '20', DURATION: '60s' }, floor: 30 },
  'plateau-40': { kind: 'capacity', env: { RATE: '40', DURATION: '60s', MAX_VUS: '400' }, floor: 60 },
  'plateau-80': { kind: 'capacity', env: { RATE: '80', DURATION: '60s', MAX_VUS: '800' }, floor: 120 },
  'plateau-160': { kind: 'capacity', env: { RATE: '160', DURATION: '60s', MAX_VUS: '1200' }, floor: 240 },
  'plateau-320': { kind: 'capacity', env: { RATE: '320', DURATION: '60s', MAX_VUS: '2000', PRE_VUS: '600' }, floor: 480 },
  'spike-10x': {
    kind: 'containment',
    env: { STAGES: '5:15s,5:15s,50:5s,50:30s,5:5s,5:30s', MAX_VUS: '600' },
    note: 'baseline 5/s, step to 50/s for 30 s, back to 5/s; recovery read from the probe',
    recoveryFrom: 65_000,
  },
  'cold-dispersed': {
    kind: 'containment',
    script: 'cold-heavy.js',
    env: { SCALE: '0.2', TIME_SCALE: '0.1', MAX_VUS: '300', MIN_SUCCESS_SHARE: '0.5', RENDER_TOKEN: stack.secrets.renderToken },
    note: 'dispersed misses over the 50 launch reads with unique query strings, sent as frontend render misses (render token); not a fresh process. Without the token the whole run is one address and the per-address public limit refused 36%.',
  },
  'fault-redis-stall': {
    kind: 'containment',
    env: { RATE: '5', DURATION: '75s' },
    fault: { at: 20_000, for: 15_000, start: () => process.kill(pidOf('redis'), 'SIGSTOP'), stop: () => process.kill(pidOf('redis'), 'SIGCONT') },
    note: 'Redis stalled (SIGSTOP) for 15 s: limiters and the session store wait on it',
  },
  'fault-db-lock': {
    kind: 'containment',
    env: { RATE: '5', DURATION: '75s' },
    fault: { at: 20_000, for: 12_000, lock: 'articles' },
    note: 'ACCESS EXCLUSIVE lock on articles for 12 s: every article read blocks',
  },
  'signed-in-2pct': {
    kind: 'capacity',
    env: { RATE: '40', DURATION: '60s', MAX_VUS: '400', SIGNED_IN_SHARE: '0.02' },
    floor: 60,
    note: 'the 40/s plateau with a launch-like 2% signed-in share instead of the default ~29%',
  },
  'viral-article': {
    kind: 'capacity',
    script: 'viral-article.js',
    env: { RATE: '50', DURATION: '60s', MAX_VUS: '400' },
    floor: 100,
    edgeStats: true,
    note: '50 visits/s on ONE free article through the site; render calls that reached the API read from the edge',
  },
  crawler: {
    kind: 'capacity',
    script: 'crawler.js',
    env: { CRAWL_RATE: '2', READER_RATE: '10', DURATION: '120s' },
    floor: 20,
    note: 'a crawler at 2/s over distinct sitemap URLs beside 10 reader journeys/s',
  },
  'cold-start': {
    kind: 'capacity',
    env: { RATE: '10', DURATION: '120s' },
    floor: 15,
    restart: true,
    note: 'every stack app restarted (fresh processes, empty in-memory caches and pools; the build and its pre-rendered pages kept), then 10 journeys/s at once',
  },
  'one-ip-through-edge': {
    kind: 'containment',
    env: { RATE: '20', DURATION: '60s' },
    edgeOverwrite: true,
    loadIdentity: false,
    note: 'the edge overwrites CF-Connecting-IP with the real peer address, as Cloudflare does, and no load identity is sent: the whole run is one caller',
  },
  'load-identity-through-edge': {
    kind: 'capacity',
    env: { RATE: '20', DURATION: '60s' },
    floor: 30,
    edgeOverwrite: true,
    loadIdentity: true,
    note: 'the same overwriting edge, with the signed load identity (decision D3): each synthetic reader is counted as itself again',
  },
  'publication-under-load': {
    kind: 'correctness',
    env: { RATE: '10', DURATION: '150s', EXCLUDE_PATHS: PUBLICATION_PATHS.join(',') },
    publication: true,
    note: 'the publication checks run while journeys arrive at 10/s; the paths they change are excluded from exact checks',
  },
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function timed(url, init = {}) {
  const started = Date.now()
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
    const text = await response.text()
    return { status: response.status, ms: Date.now() - started, text }
  } catch {
    return { status: 0, ms: Date.now() - started, text: '' }
  }
}

function rssMb(pid) {
  const result = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' })
  return result.status === 0 ? Math.round(Number(result.stdout.trim()) / 1024) : null
}

async function sample(startedAt) {
  const [page, me, stats] = await Promise.all([
    timed(`${CLIENT}${probePiece.path}`),
    timed(`${BACKEND}/api/me`, { headers: { origin: stack.origins.client } }),
    timed(`${BACKEND}/api/internal/db-stats`, { headers: { authorization: `Bearer ${stack.secrets.dbStats}` } }),
  ])
  let parsed = null
  try {
    parsed = JSON.parse(stats.text)
  } catch {
    // counted below as missing
  }
  const gates = parsed ? Object.fromEntries(Object.entries(parsed.admission).map(([name, gate]) => [name, { active: gate.active, queued: gate.queued, refused: Object.values(gate.refused).reduce((a, b) => a + b, 0) }])) : null
  return {
    t: Date.now() - startedAt,
    probeOk: page.status === 200 && page.text.includes(probePiece.markers.body) && me.status === 200,
    pageStatus: page.status,
    pageMs: page.ms,
    meStatus: me.status,
    meMs: me.ms,
    payloadWaiting: parsed ? parsed.payloadPool.waiting : null,
    sessionWaiting: parsed && parsed.visitorAuthPool ? parsed.visitorAuthPool.waiting : null,
    gates,
    refreshPending: parsed && parsed.refresh.backlog ? parsed.refresh.backlog.pending : null,
    backendRssMb: rssMb(pidOf('backend')),
  }
}

function sessionsFile() {
  // 100 sessions per identity: each real visitor has their own session, and a
  // shared one trips the per-session guard (120/min) — correctly — long
  // before the backend is busy. Still far busier per session than a reader.
  const out = execFileSync('pnpm', ['-s', 'readiness:sessions'], {
    cwd: SERVER,
    encoding: 'utf8',
    env: { ...process.env, SESSIONS_PER_IDENTITY: '100' },
  })
  return out.trim().split('\n').at(-1)
}

async function flushRedis() {
  // Rate-limit windows are 60 s and shared: without a flush, one scenario
  // spends the next one's budget. Never 6379; the stack's own Redis only.
  execFileSync('redis-cli', ['-h', '127.0.0.1', '-p', String(stack.ports.redis), 'FLUSHDB'])
}

async function edge(path, body) {
  const response = await fetch(`${BACKEND}${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`edge ${path} answered ${response.status}`)
  return response.json()
}

/** A "deploy" of the same build: every stack app stopped and started again. */
async function restartStack() {
  const window = stack.secrets.loadTest ? Math.max(1, Math.ceil((Date.parse(stack.secrets.loadTest.until) - Date.now()) / 60_000)) : null
  for (const args of [['down'], ['up', ...(window ? ['--load-test-window', String(window)] : [])]]) {
    const result = spawnSync('pnpm', ['-s', 'readiness:stack', '--', ...args], { cwd: SERVER, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    if (result.status !== 0) throw new Error(`readiness:stack ${args.join(' ')} failed:\n${(result.stderr || result.stdout).slice(-2000)}`)
  }
  stack = readStack()
}

async function runScenario(name, spec) {
  if (spec.loadIdentity && !stack.secrets.loadTest) {
    throw new Error(`${name} needs the load identity: start the stack with --load-test-window <minutes>`)
  }
  if (spec.restart) await restartStack()
  await flushRedis()
  const sessions = sessionsFile()
  const summaryPath = resolve(STATE, `supervisor-${name}.json`)
  const k6Summary = resolve(STATE, `k6-${name}.json`)
  rmSync(summaryPath, { force: true })
  rmSync(k6Summary, { force: true })

  const env = {
    ...process.env,
    WORKLOAD: resolve(K6, 'workloads/launch-local.json'),
    SESSIONS_FILE: sessions,
    TELEMETRY_INSTANCES: `readiness-stack-backend=${BACKEND}/api/internal/db-stats`,
    DB_STATS_SECRET: stack.secrets.dbStats,
    RUN_KIND: spec.kind,
    ABORT_MAX_REQUESTS: String(ENVELOPE.maxRequestsPerRun),
    ABORT_MAX_RUN_MS: String(ENVELOPE.maxRunMs),
    ABORT_QUEUE_SUSTAIN_MS: String(ENVELOPE.queueSustainMs),
    ABORT_TELEMETRY_GAP_MS: String(ENVELOPE.telemetryGapMs),
    SUPERVISOR_SUMMARY: summaryPath,
    ...(spec.floor ? { SUCCESS_FLOOR_RPS: String(spec.floor) } : {}),
    ...spec.env,
  }
  // The key reaches k6 through its environment only, and only when asked for.
  delete env.LOAD_TEST_KEY
  if (spec.loadIdentity) env.LOAD_TEST_KEY = stack.secrets.loadTest.key

  // Sessions are made first, each from its own address; only then does the
  // edge start overwriting addresses, as Cloudflare would for the run.
  if (spec.edgeOverwrite) await edge('/__edge/client-address', { overwrite: true })
  const edgeBefore = spec.edgeStats ? await edge('/__edge/stats') : null

  const startedAt = Date.now()
  const samples = []
  let memoryStop = null
  const child = spawn(
    process.execPath,
    [resolve(K6, 'supervise.mjs'), resolve(K6, spec.script ?? 'launch-journeys.js'), '--', '--quiet', '--summary-export', k6Summary, '--summary-trend-stats', 'med,p(95),p(99),max,count'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let log = ''
  child.stdout.on('data', (chunk) => (log += chunk))
  child.stderr.on('data', (chunk) => (log += chunk))
  const exited = new Promise((done) => child.on('exit', (code) => done(code)))

  const sampler = setInterval(async () => {
    const entry = await sample(startedAt)
    samples.push(entry)
    if (entry.backendRssMb && entry.backendRssMb > ENVELOPE.maxBackendRssMb && !memoryStop) {
      memoryStop = `backend RSS ${entry.backendRssMb} MB exceeded the ${ENVELOPE.maxBackendRssMb} MB envelope`
      child.kill('SIGINT')
    }
  }, 1_000)

  let lockClient = null
  let faultWindow = null
  if (spec.fault) {
    setTimeout(async () => {
      faultWindow = { from: Date.now() - startedAt }
      if (spec.fault.lock) {
        lockClient = spawn('psql', ['-X', '-q', '-d', SANDBOX_DB, '-c', `BEGIN; LOCK TABLE ${spec.fault.lock} IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(${spec.fault.for / 1000}); COMMIT;`], { stdio: 'ignore' })
      } else {
        spec.fault.start()
        setTimeout(() => spec.fault.stop(), spec.fault.for)
      }
      setTimeout(() => (faultWindow.to = Date.now() - startedAt), spec.fault.for)
    }, spec.fault.at)
  }

  let publication = null
  if (spec.publication) {
    setTimeout(() => {
      const result = spawnSync('pnpm', ['-s', 'readiness:publication'], {
        cwd: SERVER,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, PUBLICATION_SKIP_FREEZE: '1' },
      })
      publication = { exit: result.status, lines: (result.stdout || '').split('\n').filter((line) => /ok|FAIL|passed/.test(line)) }
    }, 10_000)
  }

  const code = await exited
  if (spec.edgeOverwrite) await edge('/__edge/client-address', { overwrite: false })
  const edgeAfter = spec.edgeStats ? await edge('/__edge/stats') : null
  // Keep sampling briefly after the load stops: recovery is part of the result.
  await sleep(10_000)
  clearInterval(sampler)
  if (lockClient) lockClient.kill()
  while (spec.publication && !publication) await sleep(1_000)

  const supervisor = JSON.parse(readFileSync(summaryPath, 'utf8'))
  let k6 = null
  try {
    k6 = JSON.parse(readFileSync(k6Summary, 'utf8'))
  } catch {
    // stopped before k6 wrote a summary
  }
  const pick = (name) => (k6 && k6.metrics[name] ? k6.metrics[name] : null)
  const latency = {
    pageSuccessful: pick('http_req_duration{kind:page,expected_response:true}'),
    dynamicSuccessful: pick('http_req_duration{kind:dynamic,expected_response:true}'),
    pageTtfb: pick('questura_ttfb{kind:page}'),
    pageCacheHit: pick('questura_page_cache_hit'),
    readers: pick('http_req_duration{journey:reader,kind:page,expected_response:true}'),
    crawl: pick('http_req_duration{journey:crawler,kind:page,expected_response:true}'),
    crawlRefusals: pick('questura_crawl_refusals'),
  }
  const edgeRenders = edgeBefore && edgeAfter
    ? { renderCallsToApi: edgeAfter.renders.withKey + edgeAfter.renders.withoutKey - edgeBefore.renders.withKey - edgeBefore.renders.withoutKey, forwarded: edgeAfter.forwarded - edgeBefore.forwarded }
    : null

  // Recovery: from the end of the fault (or the spike), five clean seconds.
  let recoveryMs = null
  const recoveryFrom = faultWindow?.to ?? spec.recoveryFrom
  if (recoveryFrom !== undefined) {
    for (let index = 0; index < samples.length; index += 1) {
      const window = samples.slice(index, index + 5)
      if (samples[index].t >= recoveryFrom && window.length === 5 && window.every((entry) => entry.probeOk)) {
        recoveryMs = samples[index].t - recoveryFrom
        break
      }
    }
  }

  const peak = (field) => Math.max(0, ...samples.map((entry) => entry[field] ?? 0))
  const gatePeaks = {}
  for (const entry of samples) {
    for (const [gate, value] of Object.entries(entry.gates ?? {})) {
      gatePeaks[gate] = {
        activePeak: Math.max(gatePeaks[gate]?.activePeak ?? 0, value.active),
        queuedPeak: Math.max(gatePeaks[gate]?.queuedPeak ?? 0, value.queued),
        refusedTotal: value.refused,
      }
    }
  }
  const probeFailures = samples.filter((entry) => !entry.probeOk).length
  const p95 = (values) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : null
  }
  const probeFirstMinute = { pageP95Ms: p95(samples.filter((entry) => entry.t < 60_000).map((entry) => entry.pageMs)), meP95Ms: p95(samples.filter((entry) => entry.t < 60_000).map((entry) => entry.meMs)) }

  const result = {
    scenario: name,
    note: spec.note ?? null,
    kind: spec.kind,
    envelope: ENVELOPE,
    settings: spec.env,
    floorRps: spec.floor ?? null,
    exit: code,
    memoryStop,
    supervisor,
    latency,
    fault: faultWindow,
    recoveryMs,
    probe: { samples: samples.length, failures: probeFailures, firstMinute: probeFirstMinute },
    loadIdentity: Boolean(spec.loadIdentity),
    edgeOverwrite: Boolean(spec.edgeOverwrite),
    edgeRenders,
    peaks: { payloadWaiting: peak('payloadWaiting'), sessionWaiting: peak('sessionWaiting'), backendRssMb: peak('backendRssMb'), refreshPending: peak('refreshPending'), gates: gatePeaks },
    publication,
    samples,
    tail: log.split('\n').filter((line) => /supervise|level=error/.test(line)).slice(-5),
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(resolve(OUT, `${name}.json`), JSON.stringify(result, null, 2) + '\n')
  const s = supervisor
  console.log(
    `${name.padEnd(24)} exit ${String(code).padEnd(3)} req ${s.requests} ok ${s.successes} refused ${s.refusals} failed ${s.failures} ` +
      `dropped ${s.dropped} corr ${JSON.stringify(s.correctness)} ${s.successRps}/s ok` +
      `${latency.pageSuccessful ? ` page p95 ${Math.round(latency.pageSuccessful['p(95)'])}ms` : ''}` +
      `${latency.dynamicSuccessful ? ` dyn p95 ${Math.round(latency.dynamicSuccessful['p(95)'])}ms` : ''}` +
      ` rss ${peak('backendRssMb')}MB wait ${peak('payloadWaiting')}` +
      `${recoveryMs !== null ? ` recovery ${(recoveryMs / 1000).toFixed(1)}s` : recoveryFrom !== undefined ? ' recovery NOT observed' : ''}` +
      `${s.stop ? ` STOP(${s.stop.code}): ${s.stop.reason}` : ''}`,
  )
  return result
}

const requested = process.argv.slice(2)
const names = requested.length ? requested : Object.keys(SCENARIOS)
for (const name of names) {
  if (!SCENARIOS[name]) throw new Error(`Unknown scenario ${name}`)
  await runScenario(name, SCENARIOS[name])
  await sleep(5_000)
}
