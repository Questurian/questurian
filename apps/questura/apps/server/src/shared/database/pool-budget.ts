import { looksTransactionPooled } from './pooled-uri'

/**
 * Every Postgres connection this application can open, added up — and the one
 * place pool sizes come from.
 *
 * Pool maxima are per process. They used to be written in four files, each
 * sized sensibly on its own, and nothing multiplied them by the number of
 * processes. Postgres does not care which pool exhausts it: the first symptom
 * of getting this wrong is `FATAL: sorry, too many clients already` on
 * whichever pool happens to ask next, during exactly the burst the pools were
 * sized for.
 *
 * A maximum is a ceiling, not a reservation — these connections are not held
 * open. The number still has to fit, because the ceiling is what a burst
 * reaches. Autoscaling multiplies it; a rolling deploy runs old and new
 * processes side by side; a scheduled job is a whole extra process.
 *
 * Two topologies, because a transaction pooler changes what a connection is:
 *
 * - **Direct.** Every pool is a real Postgres backend. Everything, plus a
 *   reserve for operators and migrations, must fit `DATABASE_MAX_CONNECTIONS`.
 * - **Pooled** (`DATABASE_URI` looks like PgBouncer/Neon/Supabase pooling).
 *   Pooled clients are not backends: they count against the pooler's client
 *   limit (`DATABASE_POOLER_MAX_CLIENTS`). The pooler itself holds
 *   `DATABASE_POOLER_POOL_SIZE` real backends. The advisory-lock pool bypasses
 *   the pooler on the direct URI, so its backends plus the pooler's plus the
 *   reserve must fit `DATABASE_MAX_CONNECTIONS`. Counting every pooled client
 *   as a backend would refuse deployments that fit; ignoring the direct pool
 *   would admit ones that do not.
 *
 * Outside production nothing is required and an undeclared allowance claims
 * nothing. In production every number that decides the answer must be stated
 * (`assert-production-config.ts`), because a default here would be a guess
 * about a platform this file cannot see.
 */

type Env = Record<string, string | undefined>

export type PoolSizes = {
  /** Payload's pool: page reads, admin writes, everything through the ORM. */
  payload: number
  /** Better Auth's pool: visitor sessions and accounts. */
  visitorAuth: number
  /** The advisory-lock pool: one connection per in-flight locked operation. */
  advisoryLock: number
  /**
   * The schema guard's transient pool, opened at boot and closed again. It
   * does not overlap steady-state serving, but it does overlap *other
   * processes* starting at the same moment, which is exactly what a rolling
   * restart is.
   */
  startup: number
}

const DEFAULT_POOL_SIZES: PoolSizes = {
  payload: 20,
  visitorAuth: 10,
  advisoryLock: 10,
  startup: 1,
}

const POOL_SIZE_ENV: Record<keyof PoolSizes, string | null> = {
  payload: 'DATABASE_POOL_PAYLOAD_MAX',
  visitorAuth: 'DATABASE_POOL_VISITOR_AUTH_MAX',
  advisoryLock: 'DATABASE_POOL_ADVISORY_LOCK_MAX',
  // Always one connection; not worth a knob.
  startup: null,
}

const MAX_POOL_SIZE = 200

/** Headroom for `psql`, a migration, a backup — work no pool accounts for. */
export const DEFAULT_RESERVED_CONNECTIONS = 5

type IntRead = { value: number | null; problem: string | null }

/**
 * A whole number in range, or a problem naming the variable. `null` value with
 * no problem means "not set".
 */
function readInt(env: Env, name: string, min: number, max: number): IntRead {
  const raw = env[name]?.trim()
  if (!raw) return { value: null, problem: null }

  if (!/^\d+$/.test(raw)) {
    return { value: null, problem: `${name} must be a whole number, got "${raw}".` }
  }
  const value = Number(raw)
  if (value < min || value > max) {
    return { value: null, problem: `${name} must be between ${min} and ${max}, got ${value}.` }
  }
  return { value, problem: null }
}

/**
 * The pool sizes every pool constructor uses. An invalid override falls back
 * to the default here and is reported by `poolBudget`, which production turns
 * into a refused boot — a pool must never be built from `NaN`.
 */
export function poolSizes(env: Env = process.env): PoolSizes {
  const sizes = { ...DEFAULT_POOL_SIZES }
  for (const key of Object.keys(POOL_SIZE_ENV) as Array<keyof PoolSizes>) {
    const name = POOL_SIZE_ENV[key]
    if (!name) continue
    const read = readInt(env, name, 1, MAX_POOL_SIZE)
    if (read.value !== null) sizes[key] = read.value
  }
  return sizes
}

export type BudgetLine = {
  /** What is being counted against what, in words. */
  label: string
  demand: number
  allowed: number | null
  fits: boolean | null
}

export type PoolBudget = {
  topology: 'direct' | 'pooled'
  sizes: PoolSizes
  perProcess: number
  /** Serving processes at the configured maximum. */
  processCount: number
  /** Extra serving processes alive during a rolling deploy. */
  rolloutSurge: number
  /** Scheduled-job processes that can run alongside serving. */
  jobProcessCount: number
  /** All processes that can hold pools at once. */
  processes: number
  reserved: number
  /** Every connection ceiling, summed, as if nothing were pooled. */
  total: number
  /** `DATABASE_MAX_CONNECTIONS`, or 0 when undeclared. */
  allowed: number
  lines: BudgetLine[]
  /** True when a declared allowance cannot hold its demand. */
  exceedsAllowance: boolean
  /** Invalid values, and (in production) missing ones. Each names its variable. */
  problems: string[]
}

export function poolBudget(
  env: Env = process.env,
  options: { production?: boolean } = {},
): PoolBudget {
  const production = options.production ?? env.NODE_ENV === 'production'
  const problems: string[] = []

  const take = (name: string, min: number, max: number, requiredInProduction: boolean): number | null => {
    const read = readInt(env, name, min, max)
    if (read.problem) problems.push(read.problem)
    else if (read.value === null && production && requiredInProduction) {
      problems.push(`${name} is not set.`)
    }
    return read.value
  }

  for (const name of Object.values(POOL_SIZE_ENV)) {
    if (!name) continue
    const read = readInt(env, name, 1, MAX_POOL_SIZE)
    if (read.problem) problems.push(read.problem)
  }
  const sizes = poolSizes(env)

  const maxConnections = take('DATABASE_MAX_CONNECTIONS', 1, 100_000, true)
  const processCount = take('APP_PROCESS_COUNT', 1, 10_000, true)
  const rolloutSurge = take('APP_ROLLOUT_SURGE', 0, 10_000, true)
  const jobProcessCount = take('APP_JOB_PROCESS_COUNT', 0, 1_000, false)
  const reserved = take('DATABASE_RESERVED_CONNECTIONS', 0, 10_000, false)

  const topology = looksTransactionPooled(env.DATABASE_URI ?? '') ? 'pooled' : 'direct'

  const counts = {
    processCount: processCount ?? 1,
    rolloutSurge: rolloutSurge ?? 0,
    // One nightly reconcile is the standing job; production may say 0.
    jobProcessCount: jobProcessCount ?? (production ? 1 : 0),
    reserved: reserved ?? DEFAULT_RESERVED_CONNECTIONS,
  }
  const processes = counts.processCount + counts.rolloutSurge + counts.jobProcessCount
  const perProcess = sizes.payload + sizes.visitorAuth + sizes.advisoryLock + sizes.startup
  const allowed = maxConnections ?? 0

  const line = (label: string, demand: number, limit: number | null): BudgetLine => ({
    label,
    demand,
    allowed: limit,
    fits: limit === null ? null : demand <= limit,
  })

  const lines: BudgetLine[] = []

  if (topology === 'direct') {
    lines.push(
      line('backends: every pool of every process, plus the reserve', perProcess * processes + counts.reserved, maxConnections),
    )
  } else {
    const poolerClients = take('DATABASE_POOLER_MAX_CLIENTS', 1, 1_000_000, true)
    const poolerBackends = take('DATABASE_POOLER_POOL_SIZE', 1, 100_000, true)
    // Payload, Better Auth and the boot guard all connect through DATABASE_URI.
    const pooledPerProcess = sizes.payload + sizes.visitorAuth + sizes.startup
    lines.push(line('pooler clients: pooled pools of every process', pooledPerProcess * processes, poolerClients))
    lines.push(
      line(
        'backends: pooler pool + direct advisory-lock pools + reserve',
        (poolerBackends ?? 0) + sizes.advisoryLock * processes + counts.reserved,
        poolerBackends === null ? null : maxConnections,
      ),
    )
  }

  return {
    topology,
    sizes,
    perProcess,
    ...counts,
    processes,
    total: perProcess * processes,
    allowed,
    lines,
    exceedsAllowance: lines.some((entry) => entry.fits === false),
    problems,
  }
}

export function describePoolBudget(budget: PoolBudget = poolBudget()): string {
  const { sizes } = budget
  const breakdown =
    `${sizes.payload} payload + ${sizes.visitorAuth} visitor auth + ` +
    `${sizes.advisoryLock} advisory locks + ${sizes.startup} startup`
  const processes =
    `${budget.processes} processes (${budget.processCount} serving + ${budget.rolloutSurge} rollout surge + ` +
    `${budget.jobProcessCount} jobs) × ${budget.perProcess} (${breakdown})`
  const lines = budget.lines
    .map((entry) =>
      entry.allowed === null
        ? `${entry.label}: ${entry.demand}, allowance not declared`
        : `${entry.label}: ${entry.demand} against ${entry.allowed} allowed`,
    )
    .join('; ')

  return `${budget.topology} topology, ${processes}; ${lines}`
}
