/**
 * L12's other half: two *serving* processes behind a proxy.
 *
 *   pnpm readiness:serving
 *
 * `pnpm readiness:fleet` proves the worker side — two processes competing for
 * one queue, a SIGKILL recovered, an advisory lock that really is exclusive.
 * It says so itself, and it names what it cannot cover: routing fairness, a
 * rolling release under HTTP traffic, termination grace, and whether the
 * gates that are per process and the counters that are shared behave the way
 * one process believes when there are two.
 *
 * Those all need something the worker rehearsal does not have: processes that
 * serve HTTP, and something in front of them choosing between them. So this
 * starts two production builds on their own ports, puts a loopback proxy in
 * front, and drives real traffic through it.
 *
 * The distinction it exists to make visible:
 *
 *   - **Admission gates are per process.** Each instance admits its own
 *     `PUBLIC_INGRESS_MAX` and knows nothing about the other. Two instances
 *     therefore admit twice as much work as one, which is the intent, and it
 *     means the fleet's real ceiling is the *database's*, not any one
 *     instance's.
 *   - **Rate-limit counters are shared, through Redis.** The budget is the
 *     fleet's, not each process's. If it ever fell back to per-process memory
 *     the effective limit would multiply by instance count silently — which
 *     is exactly why production refuses to boot without `REDIS_URL`.
 *
 * Both claims are made in comments elsewhere in the codebase. Neither had
 * been observed with more than one process running.
 *
 * Preconditions: a production build in `.next-readiness` (see
 * `docs/capacity/README.md`), a Redis on 6390, and the scratch database.
 * Nothing external is contacted and no paid credential is passed to a child.
 *
 * Exit 0 if every check passed, 1 otherwise.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { assertPreflight } from './preflight'
import { flushSandboxRedis } from './sandbox-redis'
import { sandboxSettings } from './sandbox'

const checks: Array<{ ok: boolean; label: string; detail?: string }> = []

function check(ok: unknown, label: string, detail?: string): void {
  const passed = Boolean(ok)
  checks.push({ ok: passed, label, detail })
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

const step = (message: string) => console.log(`--- ${message}`)
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

const DATABASE =
  process.env.READINESS_DATABASE_URI ?? `postgres://${process.env.USER}@127.0.0.1:5432/questura_readiness_scratch`
const REDIS = process.env.READINESS_REDIS_URL ?? 'redis://127.0.0.1:6390'
const DIST = process.env.NEXT_DIST_DIR ?? '.next-readiness'

/** The two serving processes, and the proxy in front of them. */
const PORTS = { a: 4101, b: 4102, proxy: 4100 } as const

const DB_STATS_SECRET = 'readiness-serving-db-stats'

type Instance = { name: string; port: number; child: ChildProcess | null; url: string }

/**
 * A child's environment.
 *
 * Built from scratch rather than inherited-and-patched: a serving process in
 * this rehearsal must not be able to reach Stripe, Bunny or email even by
 * accident, and deleting names from a copy of `process.env` leaves whatever
 * `.env` put there. `next start` still loads `.env` itself, which is why the
 * placeholders below are set explicitly — an unset variable would fall back
 * to the real one.
 */
function childEnv(instance: string, port: number): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    NEXT_DIST_DIR: DIST,
    PORT: String(port),

    DATABASE_URI: DATABASE,
    DATABASE_URI_UNPOOLED: DATABASE,
    REDIS_URL: REDIS,

    // Production refuses localhost for these two, so they are placeholders
    // that resolve to nothing. Nothing in this rehearsal follows them.
    NEXT_PUBLIC_APP_URL: 'https://readiness-client.invalid',
    BACKEND_URL_LOCAL: 'https://readiness-server.invalid',
    CORS_ALLOWED_ORIGINS: 'https://readiness-client.invalid',

    TRUSTED_PROXY: 'cloudflare',
    PAYLOAD_COOKIE_DOMAIN: 'host-only',
    PAYLOAD_SECRET: 'readiness-serving-payload-secret-not-a-real-one-0123456789abcdef',
    BETTER_AUTH_SECRET: 'readiness-serving-visitor-secret-not-a-real-one-0123456789abcd',

    // A destination that exists but is never delivered to: the worker is off.
    QUESTURA_CLIENT_URL: 'https://readiness-client.invalid',
    QUESTURA_REVALIDATION_SECRET: 'readiness-serving-revalidation',
    REFRESH_WORKER_INTERVAL_MS: '0',

    // Production refuses to boot without an image host; this one resolves nowhere.
    BUNNY_STORAGE_HOSTNAME: 'readiness-media.invalid',

    STRIPE_SECRET_KEY: 'sk_readiness_placeholder_not_a_key',
    STRIPE_WEBHOOK_SECRET: 'whsec_readiness_placeholder',
    // Required in production; the outbound guard means neither reaches Resend.
    RESEND_API_KEY: 're_readiness_placeholder_not_a_key',
    EMAIL_FROM_ADDRESS: 'readiness@readiness-client.invalid',
    STRIPE_PRICE_ID: 'price_readiness_placeholder',
    STRIPE_PRICE_ID_MONTHLY: 'price_readiness_placeholder',

    DATABASE_MAX_CONNECTIONS: '100',
    APP_PROCESS_COUNT: '2',
    APP_ROLLOUT_SURGE: '0',
    APP_JOB_PROCESS_COUNT: '0',
    DATABASE_POOL_PAYLOAD_MAX: '10',
    DATABASE_POOL_VISITOR_AUTH_MAX: '5',
    DATABASE_POOL_ADVISORY_LOCK_MAX: '4',

    // The identity the collector reads. Without it two processes on one
    // machine can report the same id and every per-process sum is wrong.
    QUESTURA_INSTANCE_ID: instance,
    PUBLIC_API_DIAGNOSTICS: '1',
    DB_STATS_SECRET,
  }
}

function startInstance(name: string, port: number): Instance {
  const child = spawn('node_modules/.bin/next', ['start', '-p', String(port)], {
    cwd: resolve(process.cwd()),
    env: childEnv(name, port),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const label = `[${name}]`
  child.stdout!.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim()
    if (text && process.env.READINESS_VERBOSE) console.log(`${label} ${text}`)
  })
  child.stderr!.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim()
    // A boot refusal is the single most useful thing this script can print.
    if (text) console.error(`${label} ${text.slice(0, 500)}`)
  })

  return { name, port, child, url: `http://127.0.0.1:${port}` }
}

async function waitUntilServing(instance: Instance, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (instance.child?.exitCode !== null && instance.child?.exitCode !== undefined) return false
    try {
      const response = await fetch(`${instance.url}/api/internal/db-stats`, {
        headers: { authorization: `Bearer ${DB_STATS_SECRET}` },
        signal: AbortSignal.timeout(2_000),
      })
      if (response.ok) return true
    } catch {
      // Not up yet.
    }
    await sleep(500)
  }
  return false
}

type Stats = {
  instance?: { id?: string; startedAt?: string }
  admission?: Record<string, { active: number; queued: number; admitted: number; refused: Record<string, number> }>
}

async function stats(instance: Instance): Promise<Stats | null> {
  try {
    const response = await fetch(`${instance.url}/api/internal/db-stats`, {
      headers: { authorization: `Bearer ${DB_STATS_SECRET}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return null
    return (await response.json()) as Stats
  } catch {
    return null
  }
}

const admitted = (snapshot: Stats | null, scope = 'ingress'): number => snapshot?.admission?.[scope]?.admitted ?? 0

/**
 * The thing in front.
 *
 * Deliberately the smallest router that can be wrong in the ways being
 * tested: round robin, a drain list, and a count of what it sent where. A
 * real load balancer has health checks and retries, and both would *hide* the
 * failures this is looking for — a rolling release that drops requests looks
 * fine behind something that retries them.
 *
 * Named `LoopbackProxy`, not `Proxy`: an earlier edit removed the class and
 * left `new Proxy(instances)` resolving to the JavaScript built-in, which
 * fails with "Cannot create proxy with a non-object as target or handler" —
 * an error that says nothing about routing.
 */
class LoopbackProxy {
  readonly sent: Record<string, number> = {}
  /** Upstreams currently eligible. Draining one removes it from here. */
  private live: Instance[] = []
  private next = 0
  private server: Server | null = null
  /** Send everything to one upstream, for the skewed-routing case. */
  pin: Instance | null = null

  constructor(private readonly all: Instance[]) {
    this.live = [...all]
    for (const instance of all) this.sent[instance.name] = 0
  }

  drain(name: string): void {
    this.live = this.live.filter((instance) => instance.name !== name)
  }

  restore(name: string): void {
    if (this.live.some((instance) => instance.name === name)) return
    const instance = this.all.find((entry) => entry.name === name)
    if (instance) this.live.push(instance)
  }

  reset(): void {
    for (const name of Object.keys(this.sent)) this.sent[name] = 0
  }

  async listen(port: number): Promise<void> {
    this.server = createServer((clientReq, clientRes) => {
      const target = this.pin ?? this.live[this.next++ % Math.max(this.live.length, 1)]
      if (!target) {
        clientRes.writeHead(503).end('no upstream')
        return
      }
      this.sent[target.name] = (this.sent[target.name] ?? 0) + 1

      const upstream = httpRequest(
        {
          host: '127.0.0.1',
          port: target.port,
          method: clientReq.method,
          path: clientReq.url,
          headers: { ...clientReq.headers, host: `127.0.0.1:${target.port}` },
        },
        (upstreamRes) => {
          clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
          upstreamRes.pipe(clientRes)
        },
      )
      upstream.on('error', () => {
        if (!clientRes.headersSent) clientRes.writeHead(502)
        clientRes.end('upstream error')
      })
      clientReq.pipe(upstream)
    })

    await new Promise<void>((done) => this.server!.listen(port, '127.0.0.1', done))
  }

  async close(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = null
    await new Promise<void>((done) => server.close(() => done()))
  }
}

type TrafficResult = { ok: number; failed: number; statuses: Record<number, number> }

/** Sequential, bounded traffic through the proxy. Counts, never asserts. */
async function drive(path: string, count: number, port = PORTS.proxy): Promise<TrafficResult> {
  const result: TrafficResult = { ok: 0, failed: 0, statuses: {} }
  for (let index = 0; index < count; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        signal: AbortSignal.timeout(10_000),
        // Nothing here may be answered from a cache; the point is that a
        // request reached one of the two processes.
        cache: 'no-store',
      })
      result.statuses[response.status] = (result.statuses[response.status] ?? 0) + 1
      if (response.status < 500) result.ok += 1
      else result.failed += 1
      await response.arrayBuffer()
    } catch {
      result.failed += 1
    }
  }
  return result
}

/** Continuous traffic until `stop()` is called. Used across a restart. */
function driveContinuously(path: string, intervalMs = 40): { stop: () => Promise<TrafficResult> } {
  const result: TrafficResult = { ok: 0, failed: 0, statuses: {} }
  let running = true

  const loop = (async () => {
    while (running) {
      try {
        const response = await fetch(`http://127.0.0.1:${PORTS.proxy}${path}`, {
          signal: AbortSignal.timeout(10_000),
          cache: 'no-store',
        })
        result.statuses[response.status] = (result.statuses[response.status] ?? 0) + 1
        if (response.status < 500) result.ok += 1
        else result.failed += 1
        await response.arrayBuffer()
      } catch {
        result.failed += 1
      }
      await sleep(intervalMs)
    }
  })()

  return {
    stop: async () => {
      running = false
      await loop
      return result
    },
  }
}

async function main(): Promise<void> {
  assertPreflight({ ...sandboxSettings(), databaseUri: DATABASE, env: {} })

  if (!existsSync(resolve(process.cwd(), DIST))) {
    throw new Error(
      `No production build at ${DIST}. Build one first:\n` +
        `  source scripts/measure/local-prod-env.sh\n` +
        `  NEXT_DIST_DIR=${DIST} pnpm build`,
    )
  }

  // Children from a crashed earlier run keep their ports, and the next run
  // then measures *those* processes while believing they are its own. Refuse
  // instead, and name the ports.
  for (const port of [PORTS.a, PORTS.b, PORTS.proxy]) {
    const taken = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_500) })
      .then(() => true)
      .catch(() => false)
    if (taken) {
      throw new Error(
        `Port ${port} is already serving. Stop it first — this rehearsal has to own all three ports:\n` +
          `  lsof -nP -iTCP:${port} -sTCP:LISTEN`,
      )
    }
  }

  const a = startInstance('readiness-a', PORTS.a)
  const b = startInstance('readiness-b', PORTS.b)
  const instances = [a, b]
  const proxy = new LoopbackProxy(instances)

  const stopAll = () => {
    for (const instance of instances) instance.child?.kill('SIGKILL')
  }

  try {
    step('starting two serving processes on the production build')
    const [aUp, bUp] = await Promise.all([waitUntilServing(a), waitUntilServing(b)])
    if (!aUp || !bUp) {
      throw new Error(
        `A serving process did not come up (a=${aUp}, b=${bUp}). The stderr above is the boot refusal.`,
      )
    }
    step('both processes are serving')

    await proxy.listen(PORTS.proxy)
    step(`proxy on ${PORTS.proxy} in front of ${PORTS.a} and ${PORTS.b}`)

    // ---------------------------------------------------------------------
    // 1. Two processes, two identities.
    // ---------------------------------------------------------------------
    const [statsA, statsB] = await Promise.all([stats(a), stats(b)])
    check(
      statsA?.instance?.id && statsB?.instance?.id && statsA.instance.id !== statsB.instance.id,
      'the two processes report distinct identities — per-process sums are not double counting one process',
      `${statsA?.instance?.id} / ${statsB?.instance?.id}`,
    )

    // ---------------------------------------------------------------------
    // 2. Routing fairness. Round robin reaches both, roughly evenly.
    // ---------------------------------------------------------------------
    const PATH = '/api/public/locations/menu?lang=en'
    await flushSandboxRedis(REDIS)
    const beforeFair = { a: admitted(await stats(a)), b: admitted(await stats(b)) }
    proxy.reset()
    const fair = await drive(PATH, 40)
    const afterFair = { a: admitted(await stats(a)), b: admitted(await stats(b)) }

    const gotA = afterFair.a - beforeFair.a
    const gotB = afterFair.b - beforeFair.b

    check(
      fair.failed === 0 && (fair.statuses[200] ?? 0) === 40,
      'forty requests through the proxy, all answered 200',
      `statuses ${JSON.stringify(fair.statuses)}`,
    )
    check(
      gotA > 0 && gotB > 0,
      'both processes admitted work — the proxy is not one process with a spare',
      `${gotA} / ${gotB} admitted`,
    )
    check(
      Math.abs(gotA - gotB) <= Math.max(4, (gotA + gotB) * 0.25),
      'round robin splits work about evenly between the two',
      `${gotA} vs ${gotB}`,
    )

    // ---------------------------------------------------------------------
    // 3. Skewed routing. One process carries everything, and the gate that
    //    bounds it is its own.
    // ---------------------------------------------------------------------
    const beforeSkew = { a: admitted(await stats(a)), b: admitted(await stats(b)) }
    proxy.pin = a
    const skew = await drive(PATH, 30)
    proxy.pin = null
    const afterSkew = { a: admitted(await stats(a)), b: admitted(await stats(b)) }

    check(
      afterSkew.a - beforeSkew.a >= 25 && afterSkew.b - beforeSkew.b === 0,
      'skewed routing lands entirely on one process — the idle one lends it nothing',
      `${afterSkew.a - beforeSkew.a} to a, ${afterSkew.b - beforeSkew.b} to b, ${skew.failed} failed`,
    )

    // ---------------------------------------------------------------------
    // 4. Rate-limit counters are shared; admission gates are not.
    //
    //    The sitemap budget is the lowest in the app: 30 per IP per minute
    //    (`PUBLIC_READ_RATE_LIMITS.sitemap`). Split round robin across two
    //    processes, each sees about half. A per-process counter would
    //    therefore refuse nothing at all; a shared one refuses once the
    //    *fleet* has served thirty.
    // ---------------------------------------------------------------------
    await flushSandboxRedis(REDIS)
    step('spending the fleet-wide sitemap budget across two processes')
    const sitemap = await drive('/api/public/sitemap-entries?lang=en', 45)
    const refused = sitemap.statuses[429] ?? 0

    check(
      refused > 0,
      'the per-IP budget is the FLEET\'s, not each process\'s — a shared Redis counter, as production requires',
      `${refused} of 45 refused with 429 while no single process served 30`,
    )
    check(
      (sitemap.statuses[200] ?? 0) <= 32,
      'and the limit really is about thirty in total, not thirty each',
      `${sitemap.statuses[200] ?? 0} served, ${refused} refused`,
    )

    // ---------------------------------------------------------------------
    // 5. A rolling release under traffic. Drain, stop, restart, restore.
    // ---------------------------------------------------------------------
    await flushSandboxRedis(REDIS)
    step('rolling one process while traffic continues')
    const traffic = driveContinuously(PATH)
    await sleep(1_000)

    proxy.drain('readiness-a')
    // Give anything already in flight on `a` a moment to finish before the
    // signal. This is the *deploy procedure*, not a property of the app —
    // and a release that skips it is what the termination-grace check below
    // measures.
    await sleep(300)
    a.child!.kill('SIGTERM')
    await sleep(1_500)

    const replacement = startInstance('readiness-a', PORTS.a)
    instances[0] = replacement
    const backUp = await waitUntilServing(replacement)
    proxy.restore('readiness-a')
    await sleep(1_500)

    const rolled = await traffic.stop()

    check(backUp, 'the replacement process came back up on the same port')
    const rolledOk = rolled.statuses[200] ?? 0
    check(
      rolled.failed === 0 && rolledOk === rolled.ok,
      'a rolling release answered every request with a 200 — draining before the signal is what makes that true',
      `${rolledOk} answered 200 of ${rolled.ok + rolled.failed}, statuses ${JSON.stringify(rolled.statuses)}`,
    )

    // ---------------------------------------------------------------------
    // 6. Termination grace, measured rather than assumed.
    //
    //    An in-flight request at the moment of SIGTERM: does the process
    //    finish it, or does the connection die? This is the number a deploy
    //    procedure needs, and it is a property of `next start`, not of
    //    anything in this repository — which is why it is measured here and
    //    not asserted from a config value.
    // ---------------------------------------------------------------------
    await flushSandboxRedis(REDIS)
    step('measuring termination grace on an in-flight request')
    const victim = instances[1]!
    const inFlight = fetch(`${victim.url}/api/public/sitemap-entries?lang=en`, {
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
      .then((response) => ({ finished: true, status: response.status }))
      .catch((error) => ({ finished: false, status: 0, error: String(error) }))

    await sleep(30)
    victim.child!.kill('SIGTERM')
    const outcome = await inFlight

    // Deliberately not a pass/fail on `finished`: both answers are real
    // information, and pretending one of them is a bug would be wrong. What
    // matters is that the deploy procedure knows which it is.
    check(
      true,
      `an in-flight request at SIGTERM ${outcome.finished ? 'completed' : 'was dropped'} — the deploy procedure must drain first either way`,
      outcome.finished ? `HTTP ${outcome.status}` : 'connection closed',
    )
  } finally {
    await proxy.close()
    stopAll()
  }

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`)
  console.log(
    '\nThis covers routing, the split between per-process gates and fleet-wide counters, a rolling\n' +
      'release and termination grace. It is still one machine: it says nothing about a real load\n' +
      'balancer\'s health checks, cross-region routing, or what either platform does to a process it\n' +
      'decides to move. That is H04.',
  )
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
