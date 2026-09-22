import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applicationName,
  declaredProcessCount,
  fleetManifestProblems,
  previousGeneration,
  previousGenerationPerProcess,
  rolloutPeak,
  servingLimitProblems,
  topologyProblems,
  transientPeakConnections,
} from './fleet-manifest'

afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * The arithmetic in `pool-budget.ts` is right. What it cannot do is notice
 * that the numbers it was handed describe a fleet nobody is going to deploy.
 */
describe('processes, not containers', () => {
  // Finding 3: zero replicas × one process passed with processCount 0 and a
  // budget of the reserve alone.
  it.each([
    ['zero replicas', { APP_REPLICA_COUNT: '0', APP_PROCESSES_PER_REPLICA: '1' }, 'APP_REPLICA_COUNT must be between 1'],
    ['zero per replica', { APP_REPLICA_COUNT: '2', APP_PROCESSES_PER_REPLICA: '0' }, 'APP_PROCESSES_PER_REPLICA must be between 1'],
    ['a negative count', { APP_REPLICA_COUNT: '-2', APP_PROCESSES_PER_REPLICA: '1' }, 'must be a whole number'],
    ['a fraction', { APP_REPLICA_COUNT: '1.5', APP_PROCESSES_PER_REPLICA: '1' }, 'must be a whole number'],
    ['NaN', { APP_REPLICA_COUNT: 'NaN', APP_PROCESSES_PER_REPLICA: '1' }, 'must be a whole number'],
    ['Infinity', { APP_REPLICA_COUNT: 'Infinity', APP_PROCESSES_PER_REPLICA: '1' }, 'must be a whole number'],
    ['past a safe integer', { APP_REPLICA_COUNT: '99999999999999999999', APP_PROCESSES_PER_REPLICA: '1' }, 'must be between'],
    ['a product past the ceiling', { APP_REPLICA_COUNT: '10000', APP_PROCESSES_PER_REPLICA: '64' }, 'past the 10000'],
    ['per-replica with no replicas', { APP_PROCESSES_PER_REPLICA: '2' }, 'APP_REPLICA_COUNT is not'],
  ])('refuses %s', (_label, env, message) => {
    const { processes, problems } = declaredProcessCount(env)
    expect(processes).toBeNull()
    expect(problems.join(' ')).toContain(message)
  })

  it('never echoes something that looks like a URI', () => {
    const { problems } = declaredProcessCount({
      APP_REPLICA_COUNT: 'postgres://user:secret@db/q',
      APP_PROCESSES_PER_REPLICA: '1',
    })
    expect(problems.join(' ')).not.toContain('secret')
  })

  it('multiplies replicas by the processes each one runs', () => {
    const { processes, problems } = declaredProcessCount({
      APP_REPLICA_COUNT: '4',
      APP_PROCESSES_PER_REPLICA: '2',
    })

    // Four containers running two Node processes is eight sets of pools.
    // CAP-07's own example said "4 processes" while describing four
    // containers.
    expect(processes).toBe(8)
    expect(problems).toEqual([])
  })

  it('refuses a declaration that disagrees with itself', () => {
    const { problems } = declaredProcessCount({
      APP_PROCESS_COUNT: '4',
      APP_REPLICA_COUNT: '4',
      APP_PROCESSES_PER_REPLICA: '2',
    })

    expect(problems.join(' ')).toContain('APP_PROCESS_COUNT is 4')
    expect(problems.join(' ')).toContain('is 8')
  })

  it('refuses replicas with no processes-per-replica, rather than assuming one', () => {
    const { problems } = declaredProcessCount({ APP_REPLICA_COUNT: '4' })
    expect(problems.join(' ')).toContain('APP_PROCESSES_PER_REPLICA is not')
  })

  it('leaves an explicit process count alone', () => {
    expect(declaredProcessCount({ APP_PROCESS_COUNT: '4' })).toEqual({ processes: null, problems: [] })
  })
})

/**
 * A rollout is heterogeneous. Multiplying one per-process ceiling by every
 * process assumes the old generation uses the new release's pool sizes — and
 * the deploy that changes a pool size is exactly the deploy where both
 * generations are alive at once.
 */
describe('a rolling deploy runs two different releases', () => {
  it('assumes the previous generation matches when nothing says otherwise', () => {
    expect(previousGenerationPerProcess({}).perProcess).toBe(41)
  })

  it('sums the two generations separately when they differ', () => {
    const peak = transientPeakConnections(
      { APP_PREVIOUS_PER_PROCESS_CONNECTIONS: '61' },
      { servingProcesses: 4, rolloutSurge: 1, jobProcesses: 1, reserved: 5 },
    )

    // The worst moment is not "4 new + 1 old": it is all four old processes
    // still up (4×61) when the first surge process of the new release starts
    // (1×41). The old formula said 271 and undercounted by 80. The job is
    // counted at the larger generation's size (61), plus the reserve.
    expect(peak).toBe(4 * 61 + 41 + 61 + 5)
  })

  it('matches the homogeneous formula when the generations are the same', () => {
    const peak = transientPeakConnections({}, { servingProcesses: 4, rolloutSurge: 1, jobProcesses: 1, reserved: 5 })
    expect(peak).toBe(6 * 41 + 5)
    // CAP-07's unapproved proposal, for comparison.
    expect(peak).toBe(251)
  })
})

/**
 * Every state a rollout may pass through, not the one the formula assumed.
 */
describe('rolloutPeak', () => {
  it('is the steady state when nothing changes and there is no surge', () => {
    expect(rolloutPeak({ newProcesses: 4, oldProcesses: 4, surge: 0, currentPerProcess: 41, previousPerProcess: 41 })).toEqual({
      demand: 164,
      oldProcesses: 0,
      newProcesses: 4,
    })
  })

  it('finds every old process alive when the old generation is larger', () => {
    expect(rolloutPeak({ newProcesses: 4, oldProcesses: 4, surge: 1, currentPerProcess: 10, previousPerProcess: 50 })).toEqual({
      demand: 4 * 50 + 10,
      oldProcesses: 4,
      newProcesses: 1,
    })
  })

  it('fills with new processes when the new generation is larger', () => {
    expect(rolloutPeak({ newProcesses: 4, oldProcesses: 4, surge: 1, currentPerProcess: 50, previousPerProcess: 10 })).toEqual({
      demand: 4 * 50 + 10,
      oldProcesses: 1,
      newProcesses: 4,
    })
  })

  // Ten old processes being replaced by four: all ten hold pools until they
  // stop, whatever "serving count + surge" says.
  it('counts a scale-down by its old fleet', () => {
    const peak = rolloutPeak({ newProcesses: 4, oldProcesses: 10, surge: 1, currentPerProcess: 41, previousPerProcess: 41 })
    expect(peak.demand).toBe(11 * 41)
  })

  it('counts a scale-up by its new fleet', () => {
    const peak = rolloutPeak({ newProcesses: 10, oldProcesses: 4, surge: 0, currentPerProcess: 41, previousPerProcess: 41 })
    expect(peak.demand).toBe(10 * 41)
  })
})

describe('previousGeneration', () => {
  it('reads component sizes, so a pooled budget can split them', () => {
    const previous = previousGeneration({
      APP_PREVIOUS_POOL_PAYLOAD_MAX: '50',
      APP_PREVIOUS_POOL_ADVISORY_LOCK_MAX: '20',
    })
    expect(previous).toMatchObject({
      source: 'components',
      perProcess: 50 + 10 + 20 + 1,
      pooledPerProcess: 50 + 10 + 1,
      directPerProcess: 20,
    })
  })

  it('counts a legacy total on both sides of the pooler, because it cannot be split', () => {
    expect(previousGeneration({ APP_PREVIOUS_PER_PROCESS_CONNECTIONS: '200' })).toMatchObject({
      source: 'legacy-total',
      pooledPerProcess: 200,
      directPerProcess: 200,
    })
  })

  it('refuses a legacy total that disagrees with declared components', () => {
    const { problems } = previousGeneration({
      APP_PREVIOUS_PER_PROCESS_CONNECTIONS: '99',
      APP_PREVIOUS_POOL_PAYLOAD_MAX: '50',
    })
    expect(problems.join(' ')).toContain('Declare one or make them agree')
  })

  it('refuses a zero previous process count', () => {
    expect(previousGeneration({ APP_PREVIOUS_PROCESS_COUNT: '0' }).problems.join(' ')).toContain(
      'APP_PREVIOUS_PROCESS_COUNT must be between 1',
    )
  })
})

/**
 * A heuristic reads hostnames. A pooler it does not recognise selects direct
 * advisory-lock semantics silently — and those locks are what keeps two
 * concurrent Stripe webhooks for one customer from both acting.
 */
describe('topology is declared, not guessed', () => {
  it('says nothing when nothing is declared', () => {
    expect(topologyProblems({ DATABASE_URI: 'postgres://u:p@db.internal:5432/q' })).toEqual([])
  })

  it('accepts a declaration the heuristic agrees with', () => {
    expect(
      topologyProblems({ DATABASE_TOPOLOGY: 'pooled', DATABASE_URI: 'postgres://u:p@x-pooler.neon.tech/q' }),
    ).toEqual([])
  })

  it('refuses a pooler the heuristic could not see', () => {
    const problems = topologyProblems({
      DATABASE_TOPOLOGY: 'pooled',
      DATABASE_URI: 'postgres://u:p@db.internal:5432/q',
    })

    expect(problems.join(' ')).toContain('One of them is wrong')
    expect(problems.join(' ')).toContain('advisory locks')
  })

  it('refuses a value that is neither', () => {
    expect(topologyProblems({ DATABASE_TOPOLOGY: 'maybe' }).join(' ')).toContain('must be "direct" or "pooled"')
  })
})

/**
 * A setting can be configured and meaningless. The overrides accept any
 * positive integer, so a gate limit of a hundred thousand is "valid" and is
 * the absence of a gate wearing a number.
 */
describe('serving limits that are configured and mean nothing', () => {
  it('passes a sane configuration', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '')
    vi.stubEnv('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', '')
    expect(servingLimitProblems({ PUBLIC_QUERY_CONCURRENCY: '8' })).toEqual([])
  })

  it('refuses a gate limit that is not a limit', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '')
    vi.stubEnv('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', '')
    expect(servingLimitProblems({ PUBLIC_QUERY_CONCURRENCY: '100000' }).join(' ')).toContain(
      'absence of one wearing a number',
    )
  })

  it('refuses a queue longer than anyone waits', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '')
    vi.stubEnv('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', '')
    expect(servingLimitProblems({ PUBLIC_ASSEMBLY_QUEUE_MS: '120000' }).join(' ')).toContain('later than a reader waits')
  })

  it('reports an unparseable override instead of silently keeping the default', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '')
    vi.stubEnv('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', '')
    expect(servingLimitProblems({ PUBLIC_INGRESS_CONCURRENCY: 'lots' }).join(' ')).toContain('must be a whole number')
  })

  // The migration scripts set this to 0 deliberately. A serving process that
  // inherits that environment has no bound on a runaway query, and nothing
  // about the process would look wrong.
  it('refuses the migration scripts statement timeout in a serving process', () => {
    expect(servingLimitProblems({ PG_STATEMENT_TIMEOUT_MS: '0' }).join(' ')).toContain("migration scripts' value")
  })

  it('refuses a disabled idle-in-transaction timeout', () => {
    expect(servingLimitProblems({ PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: '0' }).join(' ')).toContain(
      'holds its connection and its locks',
    )
  })

  // Finding 3's timeout half: gates were read from the argument and timeouts
  // from process.env, so a check could certify one environment while boot
  // used another.
  it('checks the environment it was handed, not the process it runs in', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '0')
    expect(servingLimitProblems({ PG_STATEMENT_TIMEOUT_MS: '15000' })).toEqual([])
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '15000')
    expect(servingLimitProblems({ PG_STATEMENT_TIMEOUT_MS: '0' }).join(' ')).toContain("migration scripts' value")
  })

  it('reports an unparseable timeout instead of silently using the default', () => {
    expect(servingLimitProblems({ PG_LOCK_TIMEOUT_MS: 'soon' }).join(' ')).toContain(
      'PG_LOCK_TIMEOUT_MS must be a whole number',
    )
  })

  // Admission honours a zero queue ("refuse, don't wait") and refuses to build
  // a gate of zero; the validator now says the same thing admission does.
  it('accepts a declared zero queue', () => {
    expect(servingLimitProblems({ PRIVATE_READ_QUEUE: '0' })).toEqual([])
  })

  it.each(['PUBLIC_QUERY_CONCURRENCY', 'PUBLIC_QUERY_QUEUE_MS', 'MOUNT_STAFF_CONCURRENCY'])(
    'refuses a zero %s rather than quietly replacing it',
    (name) => {
      expect(servingLimitProblems({ [name]: '0' }).join(' ')).toContain(`${name} must be between 1`)
    },
  )

  it('checks the mount gates too', () => {
    expect(servingLimitProblems({ MOUNT_CREDENTIAL_CONCURRENCY: '100000' }).join(' ')).toContain(
      'not a bound on credential checks',
    )
  })
})

describe('application_name', () => {
  it('names the role, the release and the pool', () => {
    expect(applicationName('payload', { APP_ROLE: 'serving', QUESTURA_RELEASE_SHA: 'abcdef1234' })).toBe(
      'questura:serving:abcdef1:payload',
    )
  })

  it('is still usable with nothing configured', () => {
    expect(applicationName('advisoryLock', {})).toBe('questura:serving:dev:advisoryLock')
  })
})

describe('fleetManifestProblems', () => {
  it('collects every kind at once, rather than stopping at the first', () => {
    const problems = fleetManifestProblems({
      PG_STATEMENT_TIMEOUT_MS: '0',
      PUBLIC_QUERY_CONCURRENCY: '0',
      DATABASE_TOPOLOGY: 'nonsense',
    })

    expect(problems.length).toBeGreaterThanOrEqual(3)
  })
})
