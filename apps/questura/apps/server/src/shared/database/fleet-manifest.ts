import { poolSizes, type PoolSizes } from './pool-budget'
import { looksTransactionPooled } from './pooled-uri'
import { servingTimeouts } from './timeouts'

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

function readInt(env: Env, name: string): { value: number | null; problem: string | null } {
  const raw = env[name]?.trim()
  if (!raw) return { value: null, problem: null }
  if (!/^\d+$/.test(raw)) return { value: null, problem: `${name} must be a whole number, got "${raw}".` }
  return { value: Number(raw), problem: null }
}

/**
 * Node processes, stated two ways so they can disagree out loud.
 *
 * Returns the process count the budget should use: the explicit
 * `APP_PROCESS_COUNT` when that is all there is, and otherwise the product of
 * replicas and processes per replica — with a problem when both are given and
 * they do not match.
 */
export function declaredProcessCount(env: Env = process.env): { processes: number | null; problems: FleetProblem[] } {
  const problems: FleetProblem[] = []

  // `APP_PROCESS_COUNT` is validated where it is consumed (`pool-budget.ts`),
  // so it is only read here for the cross-check. Validating it twice would
  // report the same mistake twice.
  const explicit = readInt(env, 'APP_PROCESS_COUNT')
  const replicas = readInt(env, 'APP_REPLICA_COUNT')
  const perReplica = readInt(env, 'APP_PROCESSES_PER_REPLICA')

  for (const read of [replicas, perReplica]) if (read.problem) problems.push(read.problem)

  if (replicas.value !== null && perReplica.value === null) {
    problems.push(
      'APP_REPLICA_COUNT is set but APP_PROCESSES_PER_REPLICA is not. A container running two Node ' +
        'processes holds two sets of pools; the budget has to count processes, not containers.',
    )
  }

  if (replicas.value === null || perReplica.value === null) {
    return { processes: null, problems }
  }

  const derived = replicas.value * perReplica.value
  if (explicit.value !== null && explicit.value !== derived) {
    problems.push(
      `APP_PROCESS_COUNT is ${explicit.value} but APP_REPLICA_COUNT × APP_PROCESSES_PER_REPLICA is ` +
        `${derived}. One of them is wrong, and the budget is only as good as whichever is.`,
    )
  }

  return { processes: derived, problems }
}

/**
 * The previous release's per-process ceiling during a rolling deploy.
 *
 * Declared rather than derived, because this process cannot read the
 * environment of the generation it is replacing. Unset means "the same as
 * mine", which is true for every deploy that does not change a pool size —
 * and the ones that do are exactly the ones where saying so matters.
 */
export function previousGenerationPerProcess(env: Env = process.env, current?: PoolSizes): { perProcess: number; problems: FleetProblem[] } {
  const sizes = current ?? poolSizes(env)
  const currentTotal = sizes.payload + sizes.visitorAuth + sizes.advisoryLock + sizes.startup

  const declared = readInt(env, 'APP_PREVIOUS_PER_PROCESS_CONNECTIONS')
  if (declared.problem) return { perProcess: currentTotal, problems: [declared.problem] }
  return { perProcess: declared.value ?? currentTotal, problems: [] }
}

/**
 * The highest number of connections the fleet can want at one moment,
 * summing the two generations separately instead of assuming they match.
 */
export function transientPeakConnections(
  env: Env = process.env,
  options: { servingProcesses: number; rolloutSurge: number; jobProcesses: number; reserved: number },
): number {
  const sizes = poolSizes(env)
  const current = sizes.payload + sizes.visitorAuth + sizes.advisoryLock + sizes.startup
  const previous = previousGenerationPerProcess(env, sizes).perProcess

  return (
    options.servingProcesses * current +
    options.rolloutSurge * previous +
    options.jobProcesses * current +
    options.reserved
  )
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

  const gates: Array<{ prefix: string; what: string }> = [
    { prefix: 'PUBLIC_ASSEMBLY', what: 'curated page assembly' },
    { prefix: 'PUBLIC_QUERY', what: 'public queries' },
    { prefix: 'PUBLIC_INGRESS', what: 'public ingress' },
    { prefix: 'PRIVATE_READ', what: 'signed-in reads' },
  ]

  for (const { prefix, what } of gates) {
    const concurrency = readInt(env, `${prefix}_CONCURRENCY`)
    const queue = readInt(env, `${prefix}_QUEUE`)
    const wait = readInt(env, `${prefix}_QUEUE_MS`)

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

  // The migration scripts set these to 0 on purpose. A serving process that
  // inherits that environment has no bound on a runaway query at all, and
  // nothing about the process would look wrong.
  const timeouts = servingTimeouts()
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

/** Everything above, for `assert-production-config.ts`. */
export function fleetManifestProblems(env: Env = process.env): FleetProblem[] {
  return [...declaredProcessCount(env).problems, ...topologyProblems(env), ...servingLimitProblems(env)]
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
