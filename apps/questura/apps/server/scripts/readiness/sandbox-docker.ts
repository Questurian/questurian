/**
 * The sandbox's two stores as docker containers, so a fresh session on a host
 * with docker needs nothing else installed (launch fix plan, item 0).
 *
 *  - **Postgres** is `questura-readiness-pg` on 127.0.0.1:5442: `postgres:16`
 *    (the laptop's major) unless `READINESS_POSTGRES_IMAGE` names another
 *    official `postgres:<major>` image — CI sets `postgres:17`, Neon's major —
 *    with data on a tmpfs, trust auth, database `questura_readiness`. `stack up`
 *    starts it if it is missing, stopped or left paused by a crashed
 *    `readiness:faults`, and only when the sandbox URI points at 5442 — a URI
 *    aimed anywhere else (CI's service container, a Mac's own Postgres) is
 *    left alone.
 *  - **Redis** is `questura-readiness-redis` on 127.0.0.1:6390, `redis:7-alpine`
 *    with no persistence. It is the fallback when no `redis-server` binary is
 *    on PATH. `readiness:faults` pauses this exact container to take Redis
 *    down, so the name is not cosmetic.
 *
 * Both refuse any port but their own. 5433 and 6379 on the laptop are the
 * live Postgres and Redis (`questura-postgres`, `questura-redis`); nothing
 * here names, inspects or stops a container that is not on `SANDBOX_CONTAINERS`.
 */

import { execFileSync, spawnSync } from 'node:child_process'

export const SANDBOX_POSTGRES = {
  container: 'questura-readiness-pg',
  image: 'postgres:16',
  port: 5442,
  database: 'questura_readiness',
} as const

export const SANDBOX_REDIS = {
  container: 'questura-readiness-redis',
  image: 'redis:7-alpine',
  port: 6390,
} as const

export const SANDBOX_CONTAINERS: readonly string[] = [SANDBOX_POSTGRES.container, SANDBOX_REDIS.container]

function assertSandboxContainer(name: string): void {
  if (!SANDBOX_CONTAINERS.includes(name)) throw new Error(`Refusing to touch docker container ${name}: not a sandbox container.`)
}

/** `docker run` arguments for the sandbox Redis. Foreground, removed on exit. */
export function redisDockerArgs(port: number): string[] {
  if (port !== SANDBOX_REDIS.port) {
    throw new Error(`Refusing to run the sandbox Redis on port ${port}: it only ever runs on ${SANDBOX_REDIS.port}.`)
  }
  return [
    'run', '--rm', '--name', SANDBOX_REDIS.container,
    '-p', `127.0.0.1:${port}:6379`,
    SANDBOX_REDIS.image,
    'redis-server', '--save', '', '--appendonly', 'no',
  ]
}

const POSTGRES_IMAGE = /^postgres:\d+(\.\d+)?(-alpine)?$/

/**
 * The image the sandbox Postgres runs: `postgres:16` by default, or
 * `READINESS_POSTGRES_IMAGE`. Only the official image, by major (or
 * major.minor), is accepted, so the setting cannot pull something arbitrary.
 */
export function sandboxPostgresImage(env: NodeJS.ProcessEnv = process.env): string {
  const image = env.READINESS_POSTGRES_IMAGE?.trim()
  if (!image) return SANDBOX_POSTGRES.image
  if (!POSTGRES_IMAGE.test(image)) {
    throw new Error(`READINESS_POSTGRES_IMAGE is "${image}". It must be an official postgres image by version, e.g. postgres:17.`)
  }
  return image
}

/** `docker run` arguments for the sandbox Postgres. Detached, data on a tmpfs. */
export function postgresDockerArgs(port: number, env: NodeJS.ProcessEnv = process.env): string[] {
  if (port !== SANDBOX_POSTGRES.port) {
    throw new Error(`Refusing to run the sandbox Postgres on port ${port}: it only ever runs on ${SANDBOX_POSTGRES.port}.`)
  }
  return [
    'run', '-d', '--name', SANDBOX_POSTGRES.container,
    '--tmpfs', '/var/lib/postgresql/data',
    '-p', `127.0.0.1:${port}:5432`,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '-e', `POSTGRES_DB=${SANDBOX_POSTGRES.database}`,
    sandboxPostgresImage(env),
  ]
}

/**
 * Should `stack up` manage the Postgres container for this URI? Only for the
 * sandbox's own address; anything else was set up by someone on purpose.
 */
export function managesSandboxPostgres(databaseUri: string): boolean {
  try {
    const url = new URL(databaseUri)
    return ['127.0.0.1', 'localhost'].includes(url.hostname) && Number(url.port) === SANDBOX_POSTGRES.port
  } catch {
    return false
  }
}

export function binaryOnPath(name: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0
}

export type ContainerStatus = 'missing' | 'running' | 'paused' | 'exited' | 'created' | 'other'

export function containerStatus(name: string): ContainerStatus {
  assertSandboxContainer(name)
  const result = spawnSync('docker', ['inspect', '-f', '{{.State.Status}}', name], { encoding: 'utf8' })
  if (result.status !== 0) return 'missing'
  const status = result.stdout.trim()
  return (['running', 'paused', 'exited', 'created'] as const).find((known) => known === status) ?? 'other'
}

export function removeContainer(name: string): void {
  assertSandboxContainer(name)
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
}

function pgReady(): boolean {
  return (
    spawnSync('docker', ['exec', SANDBOX_POSTGRES.container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', SANDBOX_POSTGRES.database], {
      stdio: 'ignore',
    }).status === 0
  )
}

/**
 * Bring the sandbox Postgres container up. Returns what it had to do, so the
 * caller knows whether the database is brand new (and needs a schema).
 */
export async function ensureSandboxPostgres(): Promise<'running' | 'unpaused' | 'started' | 'created'> {
  if (!binaryOnPath('docker')) {
    throw new Error(
      `The sandbox Postgres (${SANDBOX_POSTGRES.container}, 127.0.0.1:${SANDBOX_POSTGRES.port}) needs docker, and docker is not on PATH.`,
    )
  }

  let action: 'running' | 'unpaused' | 'started' | 'created'
  const status = containerStatus(SANDBOX_POSTGRES.container)
  const wanted = sandboxPostgresImage()
  if (status !== 'missing') {
    const image = spawnSync('docker', ['inspect', '-f', '{{.Config.Image}}', SANDBOX_POSTGRES.container], { encoding: 'utf8' }).stdout.trim()
    if (image && image !== wanted) {
      throw new Error(
        `${SANDBOX_POSTGRES.container} runs ${image}, not ${wanted}. Its data is on a tmpfs and disposable: ` +
          `\`docker rm -f ${SANDBOX_POSTGRES.container}\` and run \`stack up\` again to get ${wanted}.`,
      )
    }
  }
  if (status === 'running') {
    action = 'running'
  } else if (status === 'paused') {
    execFileSync('docker', ['unpause', SANDBOX_POSTGRES.container], { stdio: 'ignore' })
    action = 'unpaused'
  } else if (status === 'exited' || status === 'created') {
    execFileSync('docker', ['start', SANDBOX_POSTGRES.container], { stdio: 'ignore' })
    action = 'started'
  } else {
    if (status !== 'missing') removeContainer(SANDBOX_POSTGRES.container)
    execFileSync('docker', postgresDockerArgs(SANDBOX_POSTGRES.port), { stdio: 'ignore' })
    action = 'created'
  }

  // Over TCP, not the socket: the image's entrypoint first runs a socket-only
  // server to create the database, then restarts it listening on TCP.
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (pgReady()) return action
    await new Promise((done) => setTimeout(done, 1_000))
  }
  throw new Error(`The sandbox Postgres (${SANDBOX_POSTGRES.container}) did not become ready within 60 s.`)
}
