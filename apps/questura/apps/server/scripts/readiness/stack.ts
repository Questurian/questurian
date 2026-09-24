/**
 * The whole local sandbox as one owned set of processes (surge plan L00).
 *
 *   pnpm readiness:stack -- up --build   # Postgres, Redis, media, backend, client; builds first
 *   pnpm readiness:stack -- up --build-client  # rebuild only the client
 *   pnpm readiness:stack -- up           # reuse the last .next-readiness builds
 *   pnpm readiness:stack -- status
 *   pnpm readiness:stack -- down         # stops only what `up` started
 *
 * What it guarantees, and how each guarantee is enforced rather than hoped:
 *
 *  - **Ports.** Redis 6390, fixture media 3190, Stripe stub 3191, fake
 *    Google and mailbox 3192 (`oauth-fake.ts`), backend 4100, client 3100.
 *    Each is TCP-probed first; anything listening is a refusal, never
 *    something to attach to. Development ports (3000/4000/5432/6379) are
 *    refused by preflight.
 *  - **Loopback.** Every process binds 127.0.0.1 and loads
 *    `deny-outbound.cjs`; refused attempts land in the run's outbound log.
 *    The one exception is Google Fonts during the client *build*.
 *  - **Environment.** Built from scratch; every `.env*` name not set here is
 *    neutralised (`sandbox-env.ts`); no live or test Stripe key can be
 *    present (preflight).
 *  - **Builds.** Into `.next-readiness`, never `.next`, so a running
 *    `pnpm dev` is untouched. Files a build rewrites (`tsconfig.json`,
 *    `payload-types.ts`) are restored byte for byte afterwards.
 *  - **Ownership.** Process ids, commands and generated secrets live in a
 *    0700 state directory under the OS temp dir. `down` signals only pids
 *    whose command line still matches what `up` started.
 *  - **Redis.** A dedicated `redis-server` on 6390 with no persistence, so a
 *    flush can never reach an ordinary Redis on 6379 — the sandbox's key
 *    prefix is not relied on for isolation, because not every client in the
 *    codebase applies it. With no `redis-server` on PATH it is the
 *    `questura-readiness-redis` container instead (`sandbox-docker.ts`),
 *    which is also what `readiness:faults` pauses.
 *  - **Postgres.** When the sandbox URI is the default (127.0.0.1:5442), the
 *    `questura-readiness-pg` container is started if it is missing, stopped
 *    or paused, and a database with no schema is bootstrapped and seeded with
 *    the launch corpus before anything is built. A fresh session needs only
 *    docker. Any other URI is used as given.
 *
 * Browser-facing origins are `http://app.readiness.localhost:3100` and
 * `http://api.readiness.localhost:4100` (see `AppSettings.browser`).
 */

import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import {
  type AppSettings,
  assertPortsFree,
  backendEnv,
  CLIENT_DIR,
  clientEnv,
  portListening,
  SERVER_DIR,
  waitForApp,
} from './apps'
import { Client } from 'pg'

import { assertPreflight } from './preflight'
import { sandboxSettings, sourceIdentity } from './sandbox'
import {
  binaryOnPath,
  containerStatus,
  ensureSandboxPostgres,
  managesSandboxPostgres,
  redisDockerArgs,
  removeContainer,
  SANDBOX_REDIS,
} from './sandbox-docker'
import { flushSandboxRedis } from './sandbox-redis'
import { dotenvNames } from './sandbox-env'

export const STACK_PORTS = { client: 3100, backend: 4100, media: 3190, stripe: 3191, oauth: 3192, redis: 6390 } as const
export const STACK_DIST = '.next-readiness'
export const STATE_DIR = resolve(tmpdir(), 'questura-readiness')
const STATE_FILE = resolve(STATE_DIR, 'stack.json')

export type StackProcess = { role: string; pid: number; marker: string; log: string }

export type StackState = {
  startedAt: string
  source: ReturnType<typeof sourceIdentity>
  ports: typeof STACK_PORTS
  processes: StackProcess[]
  secrets: { revalidation: string; dbStats: string; renderToken: string }
  origins: { client: string; backend: string }
  outboundLog: string
  neutralised: { server: string[]; client: string[] }
  builtFrom: string | null
  /** How Redis was started: a local binary, or the sandbox container. Absent in older state files. */
  redis?: 'binary' | 'docker'
}

export function readStackState(): StackState | null {
  if (!existsSync(STATE_FILE)) return null
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as StackState
}

function writeState(state: StackState): void {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
  chmodSync(STATE_DIR, 0o700)
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 })
}

export function stackAppSettings(state: Pick<StackState, 'secrets' | 'origins' | 'outboundLog'>): AppSettings {
  const sandbox = sandboxSettings()
  return {
    ports: { backend: STACK_PORTS.backend, client: STACK_PORTS.client },
    databaseUri: sandbox.databaseUri,
    redisUri: `redis://127.0.0.1:${STACK_PORTS.redis}`,
    dist: STACK_DIST,
    revalidationSecret: state.secrets.revalidation,
    dbStatsSecret: state.secrets.dbStats,
    instanceId: 'readiness-stack-backend',
    browser: { clientOrigin: state.origins.client, backendOrigin: state.origins.backend },
    renderToken: state.secrets.renderToken,
    outboundLog: state.outboundLog,
    workerIntervalMs: 5_000,
    stripeStubUrl: `http://127.0.0.1:${STACK_PORTS.stripe}`,
    fakeProviderUrl: `http://127.0.0.1:${STACK_PORTS.oauth}`,
  }
}

/**
 * Start a check run from empty rate-limit counters (launch fix plan, item 0).
 *
 * Every readiness script signs in and pays from a handful of synthetic
 * addresses, and the backend's limits are per address per minute in the
 * stack's Redis. Run in launch-day order, the budget one script spent was
 * still spent when the next began: `readiness:faults` scored 17/22 with
 * checkout answering 429, against 22/22 on its own. Emptying the sandbox Redis
 * (6390 only — `flushSandboxRedis` refuses 6379 and anything off loopback) is
 * what `apps/e2e/tests/global-setup.ts` already does. Sessions survive: they
 * are in Postgres too. The limiter itself is proved elsewhere, on purpose.
 */
export async function freshRateLimits(): Promise<void> {
  await flushSandboxRedis(`redis://127.0.0.1:${STACK_PORTS.redis}`)
}

/**
 * A brand-new sandbox database has no schema. Give it the committed fixture
 * and the launch corpus, the same two steps CI runs, so `up` works from a
 * fresh container. A database that already holds the corpus is left alone.
 */
async function prepareSandboxDatabase(databaseUri: string): Promise<void> {
  const client = new Client({ connectionString: databaseUri })
  await client.connect()
  let hasSchema = false
  let hasCorpus = false
  try {
    hasSchema = (await client.query<{ t: string | null }>(`SELECT to_regclass('public.articles')::text AS t`)).rows[0]?.t != null
    if (hasSchema) {
      const corpus = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM articles WHERE slug LIKE 'launch-%'`)
      hasCorpus = (corpus.rows[0]?.n ?? 0) > 0
    }
  } finally {
    await client.end()
  }
  if (hasCorpus) return

  const run = (label: string, args: string[]) => {
    console.log(`Sandbox database is new: ${label} …`)
    const result = spawnSync('pnpm', args, { cwd: SERVER_DIR(), env: process.env, stdio: 'inherit' })
    if (result.status !== 0) throw new Error(`\`pnpm ${args.join(' ')}\` failed (exit ${result.status}).`)
  }
  if (!hasSchema) run('loading the schema fixture', ['readiness', 'bootstrap'])
  run('seeding the launch corpus', ['readiness:launch', '--', 'seed'])
}

function commandOf(pid: number): string {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

function launch(role: string, command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; marker: string }): StackProcess {
  const log = resolve(STATE_DIR, `${role}.log`)
  const out = openSync(log, 'a')
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, detached: true, stdio: ['ignore', out, out] })
  child.unref()
  if (!child.pid) throw new Error(`Could not start ${role}.`)
  return { role, pid: child.pid, marker: options.marker, log }
}

/** Run a build, then put back any tracked file it rewrote. */
function build(label: string, cwd: string, env: NodeJS.ProcessEnv, restore: string[]): void {
  const originals = new Map(restore.filter((file) => existsSync(resolve(cwd, file))).map((file) => [file, readFileSync(resolve(cwd, file))]))
  const log = resolve(STATE_DIR, `build-${label}.log`)
  console.log(`Building ${label} into ${STACK_DIST} (log: ${log}) …`)
  const result = spawnSync('pnpm', ['build'], { cwd, env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  writeFileSync(log, (result.stdout ?? '') + (result.stderr ?? ''))
  for (const [file, bytes] of originals) writeFileSync(resolve(cwd, file), bytes)
  if (result.status !== 0) throw new Error(`The ${label} build failed (exit ${result.status}). See ${log}.`)
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portListening(port)) return true
    await new Promise((done) => setTimeout(done, 250))
  }
  return false
}

export async function stackUp(options: { build: boolean; buildClient?: boolean }): Promise<StackState> {
  const sandbox = sandboxSettings()
  assertPreflight(sandbox)
  if (readStackState()) throw new Error('A stack is already recorded. Run `pnpm readiness:stack -- down` first.')

  const redisMode: 'binary' | 'docker' = binaryOnPath('redis-server') ? 'binary' : 'docker'
  if (redisMode === 'docker') {
    if (!binaryOnPath('docker')) throw new Error('Neither redis-server nor docker is on PATH. The sandbox needs one of them for Redis on 6390.')
    // No stack is recorded, so a sandbox Redis container still here was left
    // by a crash. It holds nothing worth keeping (no persistence).
    if (containerStatus(SANDBOX_REDIS.container) !== 'missing') {
      console.log(`Removing a leftover ${SANDBOX_REDIS.container} container.`)
      removeContainer(SANDBOX_REDIS.container)
    }
  }
  await assertPortsFree(Object.values(STACK_PORTS))

  if (managesSandboxPostgres(sandbox.databaseUri)) {
    const postgres = await ensureSandboxPostgres()
    if (postgres !== 'running') console.log(`Sandbox Postgres: ${postgres}.`)
    await prepareSandboxDatabase(sandbox.databaseUri)
  }

  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
  const outboundLog = resolve(STATE_DIR, 'outbound.log')
  rmSync(outboundLog, { force: true })

  const state: StackState = {
    startedAt: new Date().toISOString(),
    source: sourceIdentity(),
    ports: STACK_PORTS,
    processes: [],
    // Generated per run, never committed, never logged.
    secrets: {
      revalidation: randomBytes(24).toString('hex'),
      dbStats: randomBytes(24).toString('hex'),
      renderToken: randomBytes(24).toString('hex'),
    },
    origins: {
      client: `http://app.readiness.localhost:${STACK_PORTS.client}`,
      backend: `http://api.readiness.localhost:${STACK_PORTS.backend}`,
    },
    outboundLog,
    neutralised: { server: dotenvNames(SERVER_DIR()), client: dotenvNames(CLIENT_DIR()) },
    builtFrom: null,
    redis: redisMode,
  }
  const settings = stackAppSettings(state)
  const record = () => writeState(state)

  try {
    state.processes.push(
      redisMode === 'binary'
        ? launch('redis', 'redis-server', ['--port', String(STACK_PORTS.redis), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'], {
            cwd: STATE_DIR,
            env: { PATH: process.env.PATH, NODE_ENV: 'production' },
            marker: `redis-server 127.0.0.1:${STACK_PORTS.redis}`,
          })
        : launch('redis', 'docker', redisDockerArgs(STACK_PORTS.redis), {
            cwd: STATE_DIR,
            env: dockerEnv(),
            marker: `docker run --rm --name ${SANDBOX_REDIS.container}`,
          }),
    )
    record()
    // A container can take a while the first time (image unpacking).
    if (!(await waitForPort(STACK_PORTS.redis, redisMode === 'docker' ? 60_000 : 10_000))) {
      throw new Error(`Redis did not start on ${STACK_PORTS.redis}. See ${resolve(STATE_DIR, 'redis.log')}.`)
    }

    state.processes.push(
      launch('media', process.execPath, ['--import', 'tsx', 'scripts/readiness/media-server.ts', String(STACK_PORTS.media)], {
        cwd: SERVER_DIR(),
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production' },
        marker: 'media-server.ts',
      }),
    )
    record()
    if (!(await waitForPort(STACK_PORTS.media, 15_000))) throw new Error('The media fixture server did not start on 3190.')

    state.processes.push(
      launch('stripe-stub', process.execPath, ['--import', 'tsx', 'scripts/readiness/stripe-stub.ts', String(STACK_PORTS.stripe)], {
        cwd: SERVER_DIR(),
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production' },
        marker: 'stripe-stub.ts',
      }),
    )
    record()
    if (!(await waitForPort(STACK_PORTS.stripe, 15_000))) throw new Error('The Stripe stub did not start on 3191.')

    state.processes.push(
      launch('oauth-fake', process.execPath, ['--import', 'tsx', 'scripts/readiness/oauth-fake.ts', String(STACK_PORTS.oauth)], {
        cwd: SERVER_DIR(),
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'production',
          READINESS_GOOGLE_REDIRECT_URI: `${state.origins.backend}/api/visitor-auth/callback/google`,
        },
        marker: 'oauth-fake.ts',
      }),
    )
    record()
    if (!(await waitForPort(STACK_PORTS.oauth, 15_000))) throw new Error('The fake Google did not start on 3192.')

    if (options.build) build('server', SERVER_DIR(), backendEnv(settings), ['tsconfig.json', 'src/payload-types.ts'])

    state.processes.push(
      launch('backend', 'node_modules/.bin/next', ['start', '-p', String(STACK_PORTS.backend), '-H', '127.0.0.1'], {
        cwd: SERVER_DIR(),
        env: { ...backendEnv(settings), PORT: String(STACK_PORTS.backend) },
        marker: `next start -p ${STACK_PORTS.backend}`,
      }),
    )
    record()
    if (!(await waitForApp(`http://127.0.0.1:${STACK_PORTS.backend}/api/me`, 120_000))) {
      throw new Error(`The backend did not become ready. See ${resolve(STATE_DIR, 'backend.log')}.`)
    }

    if (options.build || options.buildClient) build('client', CLIENT_DIR(), clientEnv(settings, { build: true }), ['tsconfig.json'])

    state.processes.push(
      launch('client', 'node_modules/.bin/next', ['start', '-p', String(STACK_PORTS.client), '-H', '127.0.0.1'], {
        cwd: CLIENT_DIR(),
        env: { ...clientEnv(settings), PORT: String(STACK_PORTS.client) },
        marker: `next start -p ${STACK_PORTS.client}`,
      }),
    )
    record()
    if (!(await waitForApp(`http://127.0.0.1:${STACK_PORTS.client}/`, 120_000))) {
      throw new Error(`The client did not become ready. See ${resolve(STATE_DIR, 'client.log')}.`)
    }

    state.builtFrom = options.build ? state.source.sha : readStackBuildSha()
    if (options.build) writeFileSync(resolve(SERVER_DIR(), STACK_DIST, 'READINESS_BUILD'), state.source.sha)
    record()
    return state
  } catch (error) {
    await stackDown()
    throw error
  }
}

/** What the docker CLI needs to find its daemon, and nothing else. */
function dockerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, NODE_ENV: 'production' }
  for (const name of ['HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'XDG_RUNTIME_DIR']) {
    if (process.env[name]) env[name] = process.env[name]
  }
  return env
}

function readStackBuildSha(): string | null {
  const path = resolve(SERVER_DIR(), STACK_DIST, 'READINESS_BUILD')
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : null
}

/** Stop only what `up` recorded, and only while each pid still runs the command it started. */
export async function stackDown(): Promise<string[]> {
  const state = readStackState()
  if (!state) return []
  const stopped: string[] = []

  for (const process_ of [...state.processes].reverse()) {
    const command = commandOf(process_.pid)
    if (!command) continue
    if (!command.includes(process_.marker.split(' ')[0]!)) {
      console.warn(`Not stopping pid ${process_.pid}: it is no longer ${process_.role} (${command.slice(0, 80)}).`)
      continue
    }
    try {
      process.kill(-process_.pid, 'SIGTERM')
    } catch {
      try {
        process.kill(process_.pid, 'SIGTERM')
      } catch {
        // Already gone.
      }
    }
    stopped.push(process_.role)
  }

  const deadline = Date.now() + 10_000
  for (const process_ of state.processes) {
    while (commandOf(process_.pid) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 200))
    if (commandOf(process_.pid)) {
      try {
        process.kill(-process_.pid, 'SIGKILL')
      } catch {
        // Gone between the check and the signal.
      }
    }
  }

  // The container outlives its `docker run` client if the client was killed
  // hard; removing it by name is what frees 6390 for the next `up`.
  if (state.redis === 'docker' && containerStatus(SANDBOX_REDIS.container) !== 'missing') {
    removeContainer(SANDBOX_REDIS.container)
    if (!stopped.includes('redis')) stopped.push('redis')
  }

  rmSync(STATE_FILE, { force: true })
  return stopped
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((entry) => entry !== '--')
  const command = argv[0] ?? 'status'

  if (command === 'up') {
    const state = await stackUp({ build: argv.includes('--build'), buildClient: argv.includes('--build-client') })
    console.log(
      `Stack up from ${state.source.sha.slice(0, 8)}${state.source.dirty ? ' (dirty)' : ''}: ` +
        `client ${state.origins.client}, backend ${state.origins.backend}, media :${STACK_PORTS.media}, redis :${STACK_PORTS.redis}. ` +
        `State: ${STATE_FILE}`,
    )
    return
  }
  if (command === 'down') {
    const stopped = await stackDown()
    console.log(stopped.length ? `Stopped ${stopped.join(', ')}.` : 'No stack recorded.')
    return
  }
  if (command === 'status') {
    const state = readStackState()
    if (!state) {
      console.log('No stack recorded.')
      return
    }
    for (const process_ of state.processes) {
      console.log(`${process_.role.padEnd(8)} pid ${process_.pid} ${commandOf(process_.pid) ? 'running' : 'gone'}`)
    }
    return
  }
  throw new Error(`Unknown command "${command}". Use up [--build], down or status.`)
}

if (process.argv[1]?.endsWith('stack.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
