import { readBoundedInt } from '@/shared/config/env-int'
import { GATE_DEFAULTS } from '@/shared/http/admission'

import { poolSizes, type PoolSizes } from './pool-budget'
import { looksTransactionPooled } from './pooled-uri'
import { servingTimeouts, TIMEOUT_ENV } from './timeouts'

/**
 * What the deployment claims about itself, checked for the ways a claim can
 * be true and useless.
 *
 * `pool-budget.ts` does the arithmetic and does it correctly. What it cannot
 * do is notice that the numbers it was handed describe a fleet nobody is
 * going to deploy. Four ways that happens:
 *
 * **Containers are not processes.** `APP_PROCESS_COUNT` counts Node
 * processes, and a container running two of them is two sets of pools. Four
 * containers × two processes is eight, not four — and CAP-07's own example
 * said "4 processes" while describing four containers. A deployment can now
 * state replicas and processes-per-replica, and the total has to agree.
 *
 * **A rollout is heterogeneous.** The existing formula multiplies one
 * per-process ceiling by every process, which silently assumes the old
 * generation uses the new release's pool sizes. It does not: it uses the
 * sizes it was deployed with. Exactly the deploy that changes a pool size is
 * the one where this matters, and it is the deploy where both generations are
 * alive at once. The previous generation's ceiling can now be declared and is
 * summed separately.
 *
 * **A heuristic is not a topology.** `looksTransactionPooled` reads
 * hostnames. A pooler on a hostname it does not recognise selects direct
 * semantics silently — and direct semantics is where session advisory locks
 * are assumed to work, which is a payment correctness question. A deployment
 * can declare `DATABASE_TOPOLOGY` explicitly; when it disagrees with the
 * heuristic, that is a refusal rather than a preference.
 *
 * **A gate setting can be nonsense and still look configured.** The admission
 * overrides accept any positive integer, so `PUBLIC_QUERY_CONCURRENCY=100000`
 * is "valid" and means no gate at all. `PG_STATEMENT_TIMEOUT_MS=0` is a
 * documented, deliberate value for migrations, and a silent removal of the
 * only bound on a runaway query in a serving process.
 */

export type FleetProblem = string

const MAX_SANE_GATE = 512
const MAX_SANE_QUEUE = 4_096
const MAX_SANE_WAIT_MS = 30_000

type Env = Record<string, string | undefined>

/** Ranges for every count this file reads. A container rarely runs more than a handful of Node processes. */
export const PROCESS_LIMITS = {
  replicas: { min: 1, max: 10_000 },
  perReplica: { min: 1, max: 64 },
  processes: { min: 1, max: 10_000 },
} as const

/**
 * Node processes, stated two ways so they can disagree out loud.
 *
 * Returns the process count the budget should use: the explicit
 * `APP_PROCESS_COUNT` when that is all there is, and otherwise the product of
 * replicas and processes per replica — with a problem when both are given and
 * they do not match.
 *
 * Zero is refused, not accepted. A fleet of zero serving processes used to
 * pass with a budget of the reserve alone (discovery finding 3): the check
 * certified a deployment that could not serve, and the budget it printed
 * described nothing.
 */
export function declaredProcessCount(env: Env = process.env): { processes: number | null; problems: FleetProblem[] } {
  const problems: FleetProblem[] = []

  // `APP_PROCESS_COUNT` is validated where it is consumed (`pool-budget.ts`),
  // so it is only read here for the cross-check. Validating it twice would
  // report the same mistake twice.
  const explicit = readBoundedInt(env, 'APP_PROCESS_COUNT', PROCESS_LIMITS.processes.min, PROCESS_LIMITS.processes.max)
  const replicas = readBoundedInt(env, 'APP_REPLICA_COUNT', PROCESS_LIMITS.replicas.min, PROCESS_LIMITS.replicas.max)
  const perReplica = readBoundedInt(
    env,
    'APP_PROCESSES_PER_REPLICA',
    PROCESS_LIMITS.perReplica.min,
    PROCESS_LIMITS.perReplica.max,
  )

  for (const read of [replicas, perReplica]) if (read.problem) problems.push(read.problem)

  if (env.APP_REPLICA_COUNT?.trim() && !env.APP_PROCESSES_PER_REPLICA?.trim()) {
    problems.push(
      'APP_REPLICA_COUNT is set but APP_PROCESSES_PER_REPLICA is not. A container running two Node ' +
        'processes holds two sets of pools; the budget has to count processes, not containers.',
    )
  }
  if (!env.APP_REPLICA_COUNT?.trim() && env.APP_PROCESSES_PER_REPLICA?.trim()) {
    problems.push('APP_PROCESSES_PER_REPLICA is set but APP_REPLICA_COUNT is not.')
  }

  if (replicas.value === null || perReplica.value === null) {
    return { processes: null, problems }
  }

  const derived = replicas.value * perReplica.value
  if (derived > PROCESS_LIMITS.processes.max) {
    problems.push(
      `APP_REPLICA_COUNT × APP_PROCESSES_PER_REPLICA is ${derived}, past the ${PROCESS_LIMITS.processes.max} ` +
        'processes this budget will reason about.',
    )
    return { processes: null, problems }
  }
  if (explicit.value !== null && explicit.value !== derived) {
    problems.push(
      `APP_PROCESS_COUNT is ${explicit.value} but APP_REPLICA_COUNT × APP_PROCESSES_PER_REPLICA is ` +
        `${derived}. One of them is wrong, and the budget is only as good as whichever is.`,
    )
  }

  return { processes: derived, problems }
}

/** The per-generation pieces a budget line needs. */
type PoolParts = Pick<PoolSizes, 'payload' | 'visitorAuth' | 'advisoryLock' | 'startup'>

export type PreviousGeneration = {
  /** The previous release's pool sizes, component by component. */
  sizes: PoolParts
  /** Every connection one previous-release process can open. */
  perProcess: number
  /**
   * What one previous process can open *through the pooler* and *directly*.
   * Equal to the component sums when components were declared. When only the
   * legacy total was, both are that total — the conservative reading, because
   * a total cannot say which side of the pooler its connections sit on.
   */
  pooledPerProcess: number
  directPerProcess: number
  /** Previous-release serving processes still alive when the rollout starts. */
  processCount: number | null
  source: 'same-as-this-release' | 'components' | 'legacy-total'
  problems: FleetProblem[]
}

const PREVIOUS_POOL_ENV: Record<'payload' | 'visitorAuth' | 'advisoryLock', string> = {
  payload: 'APP_PREVIOUS_POOL_PAYLOAD_MAX',
  visitorAuth: 'APP_PREVIOUS_POOL_VISITOR_AUTH_MAX',
  advisoryLock: 'APP_PREVIOUS_POOL_ADVISORY_LOCK_MAX',
}

/**
 * The generation a rolling deploy is replacing.
 *
 * Declared rather than derived, because this process cannot read the
 * environment of the generation it is replacing. Unset means "the same as
 * mine", which is true for every deploy that does not change a pool size or
 * the fleet size — and the ones that do are exactly the ones where saying so
 * matters.
 *
 * Two ways to declare it:
 *
 *  - **Components** (`APP_PREVIOUS_POOL_*_MAX`): the previous pool sizes. The
 *    only form that is exact behind a transaction pooler, where Payload and
 *    Better Auth connect through the pooler and the advisory-lock pool does
 *    not. Unset components mean "same as this release".
 *  - **Legacy total** (`APP_PREVIOUS_PER_PROCESS_CONNECTIONS`): one number.
 *    Exact for direct topology. Behind a pooler it is counted in full against
 *    *both* the pooler's client limit and the direct backends — it cannot be
 *    ignored (finding 3: a larger previous generation left the pooled budget
 *    unchanged) and it cannot be split without guessing.
 *
 * `APP_PREVIOUS_PROCESS_COUNT` is how many previous-release serving processes
 * exist when the rollout begins. Unset means the same count as this release;
 * a scale-down deploy (ten old, four new) must say ten, because every one of
 * them holds its pools until it is stopped.
 */
export function previousGeneration(env: Env = process.env, current?: PoolSizes): PreviousGeneration {
  const sizes = current ?? poolSizes(env)
  const problems: FleetProblem[] = []

  const parts: PoolParts = { ...sizes }
  let components = false
  for (const key of Object.keys(PREVIOUS_POOL_ENV) as Array<keyof typeof PREVIOUS_POOL_ENV>) {
    const read = readBoundedInt(env, PREVIOUS_POOL_ENV[key], 1, 200)
    if (read.problem) problems.push(read.problem)
    if (read.value !== null) {
      parts[key] = read.value
      components = true
    }
  }

  const legacy = readBoundedInt(env, 'APP_PREVIOUS_PER_PROCESS_CONNECTIONS', 1, 1_000)
  if (legacy.problem) problems.push(legacy.problem)

  const count = readBoundedInt(
    env,
    'APP_PREVIOUS_PROCESS_COUNT',
    PROCESS_LIMITS.processes.min,
    PROCESS_LIMITS.processes.max,
  )
  if (count.problem) problems.push(count.problem)

  const componentTotal = parts.payload + parts.visitorAuth + parts.advisoryLock + parts.startup
  const componentPooled = parts.payload + parts.visitorAuth + parts.startup

  if (components && legacy.value !== null && legacy.value !== componentTotal) {
    problems.push(
      `APP_PREVIOUS_PER_PROCESS_CONNECTIONS is ${legacy.value} but the APP_PREVIOUS_POOL_* sizes add up to ` +
        `${componentTotal}. Declare one or make them agree.`,
    )
  }

  if (!components && legacy.value !== null) {
    return {
      sizes: parts,
      perProcess: legacy.value,
      pooledPerProcess: legacy.value,
      directPerProcess: legacy.value,
      processCount: count.value,
      source: 'legacy-total',
      problems,
    }
  }

  return {
    sizes: parts,
    perProcess: componentTotal,
    pooledPerProcess: componentPooled,
    directPerProcess: parts.advisoryLock,
    processCount: count.value,
    source: components ? 'components' : 'same-as-this-release',
    problems,
  }
}

/** Kept for callers that only need the total. */
export function previousGenerationPerProcess(
  env: Env = process.env,
  current?: PoolSizes,
): { perProcess: number; problems: FleetProblem[] } {
  const previous = previousGeneration(env, current)
  return { perProcess: previous.perProcess, problems: previous.problems }
}

export type RolloutPeak = {
  demand: number
  /** The rollout state that produced it. */
  oldProcesses: number
  newProcesses: number
}

/**
 * The worst moment of a rolling deploy, found by walking every state it may
 * pass through rather than assuming one.
 *
 * A rollout may run at most `max(old, new) + surge` serving processes at
 * once, of which any number up to `old` may still be the previous release and
 * any number up to `new` the next. Demand is linear in each, so for each
 * count of old processes the worst state fills the remaining room with new
 * ones. Walking them all catches the two cases the old formula,
 * `new × current + surge × previous`, missed: a previous generation *larger*
 * than this one (all `old` of them are alive when the first `surge` new ones
 * start), and a scale-down (ten old processes, four new).
 */
export function rolloutPeak(options: {
  newProcesses: number
  oldProcesses: number
  surge: number
  currentPerProcess: number
  previousPerProcess: number
}): RolloutPeak {
  const { newProcesses, oldProcesses, surge, currentPerProcess, previousPerProcess } = options
  const room = Math.max(oldProcesses, newProcesses) + surge

  let best: RolloutPeak = { demand: newProcesses * currentPerProcess, oldProcesses: 0, newProcesses }
  for (let old = 0; old <= oldProcesses; old += 1) {
    const fresh = Math.min(newProcesses, room - old)
    if (fresh < 0) break
    const demand = old * previousPerProcess + fresh * currentPerProcess
    if (demand > best.demand) best = { demand, oldProcesses: old, newProcesses: fresh }
  }
  return best
}

/**
 * The highest number of direct connections the fleet can want at one moment:
 * the worst rollout state, every job process at the larger generation's size
 * (a job started by the old release can outlive its deploy), and the reserve.
 */
export function transientPeakConnections(
  env: Env = process.env,
  options: { servingProcesses: number; rolloutSurge: number; jobProcesses: number; reserved: number },
): number {
  const sizes = poolSizes(env)
  const current = sizes.payload + sizes.visitorAuth + sizes.advisoryLock + sizes.startup
  const previous = previousGeneration(env, sizes)

  const peak = rolloutPeak({
    newProcesses: options.servingProcesses,
    oldProcesses: previous.processCount ?? options.servingProcesses,
    surge: options.rolloutSurge,
    currentPerProcess: current,
    previousPerProcess: previous.perProcess,
  })

  return peak.demand + options.jobProcesses * Math.max(current, previous.perProcess) + options.reserved
}

/**
 * The topology, declared. A heuristic that guesses wrong about a pooler
 * chooses direct advisory-lock semantics silently, and those are what keeps
 * two concurrent Stripe webhooks for one customer from both acting.
 */
export function topologyProblems(env: Env = process.env): FleetProblem[] {
  const declared = env.DATABASE_TOPOLOGY?.trim().toLowerCase()
  if (!declared) return []

  if (declared !== 'direct' && declared !== 'pooled') {
    return [`DATABASE_TOPOLOGY must be "direct" or "pooled", got "${declared}".`]
  }

  const guessed = looksTransactionPooled(env.DATABASE_URI ?? '') ? 'pooled' : 'direct'
  if (declared === guessed) return []

  return [
    `DATABASE_TOPOLOGY says "${declared}" but DATABASE_URI looks "${guessed}". One of them is wrong. ` +
      'Session advisory locks do not survive transaction pooling, and getting this wrong is silent: ' +
      'the locks simply stop coordinating.',
  ]
}

/**
 * Serving gates and timeouts, checked for values that are configured and
 * meaningless.
 */
export function servingLimitProblems(env: Env = process.env): FleetProblem[] {
  const problems: FleetProblem[] = []

  for (const { prefix, what } of Object.values(GATE_DEFAULTS)) {
    // Concurrency and wait must be at least one; a queue of zero is a real
    // policy ("refuse rather than wait") and `admission.ts` honours it. The
    // ranges here match what admission actually accepts, so nothing it would
    // quietly replace with a default is reported as configured.
    const concurrency = readBoundedInt(env, `${prefix}_CONCURRENCY`, 1, Number.MAX_SAFE_INTEGER)
    const queue = readBoundedInt(env, `${prefix}_QUEUE`, 0, Number.MAX_SAFE_INTEGER)
    const wait = readBoundedInt(env, `${prefix}_QUEUE_MS`, 1, Number.MAX_SAFE_INTEGER)

    for (const read of [concurrency, queue, wait]) if (read.problem) problems.push(read.problem)

    // A silent fallback is the trap: an unparseable override left the default
    // in place and the operator believed the number they set.
    if (concurrency.value !== null && concurrency.value > MAX_SANE_GATE) {
      problems.push(
        `${prefix}_CONCURRENCY is ${concurrency.value}, which is not a bound on ${what} — it is the ` +
          'absence of one wearing a number.',
      )
    }
    if (queue.value !== null && queue.value > MAX_SANE_QUEUE) {
      problems.push(`${prefix}_QUEUE is ${queue.value}; a queue that long is a timeout with extra steps.`)
    }
    if (wait.value !== null && wait.value > MAX_SANE_WAIT_MS) {
      problems.push(
        `${prefix}_QUEUE_MS is ${wait.value}; past a few seconds the answer arrives later than a reader waits.`,
      )
    }
  }

  // Read from the environment being checked, not from `process.env`. The old
  // version validated gates from its argument and timeouts from the process,
  // so a test (or a preflight) could certify one environment while boot used
  // another.
  for (const name of TIMEOUT_ENV) {
    const read = readBoundedInt(env, name, 0, 3_600_000)
    if (read.problem) problems.push(read.problem)
  }

  // The migration scripts set these to 0 on purpose. A serving process that
  // inherits that environment has no bound on a runaway query at all, and
  // nothing about the process would look wrong.
  const timeouts = servingTimeouts(env)
  if (timeouts.statementMs <= 0) {
    problems.push(
      'PG_STATEMENT_TIMEOUT_MS is 0 for a serving process. That is the migration scripts\' value; in ' +
        'serving it removes the only bound on a query that never finishes.',
    )
  }
  if (timeouts.idleInTransactionMs <= 0) {
    problems.push(
      'PG_IDLE_IN_TRANSACTION_TIMEOUT_MS is 0 for a serving process — a handler that returns early ' +
        'holds its connection and its locks until the process dies.',
    )
  }

  return problems
}

/** Everything above, for `assert-production-config.ts`. Budget problems come from `poolBudget`. */
export function fleetManifestProblems(env: Env = process.env): FleetProblem[] {
  return [...topologyProblems(env), ...servingLimitProblems(env)]
}

/**
 * A name Postgres reports in `pg_stat_activity`, so observed connections can
 * be reconciled with the pools that are supposed to have opened them.
 *
 * Without it every connection is `node`, and a budget that says 41 per
 * process cannot be checked against a database that says 300 in total.
 */
export function applicationName(pool: keyof PoolSizes | 'startup', env: Env = process.env): string {
  const role = env.APP_ROLE?.trim() || 'serving'
  const release = (env.QUESTURA_RELEASE_SHA?.trim() || 'dev').slice(0, 7)
  return `questura:${role}:${release}:${pool}`
}
