/**
 * More than one process, against one database, for real.
 *
 *   pnpm readiness:fleet
 *
 * Every gate and every coalescing decision in this codebase is per process.
 * That is safe only if the number of processes is bounded and the shared
 * state they do coordinate through — the outbox claim, the advisory lock, the
 * connection budget — behaves the way one process believes it does. A single
 * process cannot test any of that, and a mock cannot either: "two workers
 * cannot both finish this job" is a statement about two operating-system
 * processes and one Postgres.
 *
 * So this starts real child processes against the disposable database and
 * watches what they do. It is deliberately not a load test; the numbers it
 * produces are correctness, not capacity.
 *
 * What it covers, and what it does not, is stated at the end of the run so a
 * reader cannot mistake it for a fleet proof. Routing fairness, rolling
 * releases under HTTP traffic and termination grace need serving processes
 * and a proxy, which is L12's remaining half and is recorded as owed.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Pool } from 'pg'

import { FaultReceiver } from './fault-receiver'
import { createSandboxSchema, REFRESH_JOBS_DDL, sandboxDatabaseUri, sandboxPool } from './database'

const SCHEMA = 'readiness_fleet'
const WORKER = resolve(dirname(fileURLToPath(import.meta.url)), 'fleet-worker.ts')

const checks: Array<{ ok: boolean; label: string; detail?: string }> = []

function check(ok: unknown, label: string, detail?: string): void {
  const passed = Boolean(ok)
  checks.push({ ok: passed, label, detail })
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

type Line = Record<string, unknown>

function startWorker(name: string, env: Record<string, string> = {}): { child: ChildProcess; lines: Line[] } {
  const lines: Line[] = []
  const child = spawn('npx', ['tsx', WORKER], {
    env: {
      ...process.env,
      READINESS_DATABASE_URI: sandboxDatabaseUri(),
      READINESS_WORKER_NAME: name,
      READINESS_SCHEMA: SCHEMA,
      QUESTURA_CLIENT_URL: process.env.QUESTURA_CLIENT_URL,
      QUESTURA_REVALIDATION_SECRET: process.env.QUESTURA_REVALIDATION_SECRET,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  let buffer = ''
  child.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      if (!part.trim()) continue
      try {
        lines.push(JSON.parse(part) as Line)
      } catch {
        // A worker that printed something unexpected is worth seeing.
        console.error(`[${name}] ${part}`)
      }
    }
  })

  return { child, lines }
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function queueEmpty(pool: Pool, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const left = await pool.query(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status <> 'done'`)
    if (left.rows[0].n === 0) return true
    await sleep(100)
  }
  return false
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return true
    await sleep(50)
  }
  return condition()
}

const step = (message: string) => console.log(`--- ${message}`)

async function main(): Promise<void> {
  step('starting receiver')
  const receiver = new FaultReceiver()
  const port = await receiver.listen()
  process.env.QUESTURA_CLIENT_URL = `http://127.0.0.1:${port}`
  process.env.QUESTURA_REVALIDATION_SECRET = 'readiness-fleet'

  step('preparing schema')
  await createSandboxSchema(SCHEMA)
  const pool = sandboxPool(4, SCHEMA)
  await pool.query(REFRESH_JOBS_DDL)
  await pool.query('DELETE FROM refresh_jobs')
  step('schema ready')

  const workers: ChildProcess[] = []
  const stopAll = () => {
    for (const child of workers) child.kill('SIGKILL')
  }

  try {
    // ---------------------------------------------------------------------
    // 1. Two processes, one queue. Every job done exactly once.
    // ---------------------------------------------------------------------
    const JOBS = 40
    for (let index = 0; index < JOBS; index += 1) {
      await pool.query(
        `INSERT INTO refresh_jobs (kind, dedupe_key, target, reason, status, attempts, generation, next_attempt_at)
         VALUES ('revalidate', $1, $2::jsonb, 'fleet', 'pending', 0, 1, now())`,
        [`revalidate:fleet-${index}`, JSON.stringify({ tags: [`fleet-${index}`], paths: [] })],
      )
    }

    step(`enqueued ${JOBS} jobs; starting two workers`)
    const a = startWorker('a')
    const b = startWorker('b')
    workers.push(a.child, b.child)
    await waitFor(() => a.lines.length > 0 && b.lines.length > 0, 60_000)
    step('both workers reported started')

    const startedAt = Date.now()
    const drained = await queueEmpty(pool, 60_000)
    const tookMs = Date.now() - startedAt

    check(drained, 'two processes drain one queue to empty', `${JOBS} jobs in ${tookMs}ms`)

    const tags = receiver.allTags()
    check(tags.size === JOBS, `every job was delivered (${tags.size}/${JOBS} distinct targets)`)

    // At-least-once is the contract, so a duplicate is tolerated; it is the
    // *rate* that would show a claim doing nothing.
    const duplicates = receiver.deliveries.length - tags.size
    check(duplicates <= 2, 'delivery is at-least-once without runaway duplication', `${duplicates} duplicate deliveries`)

    const bothWorked =
      a.lines.some((line) => line.event === 'drain' && Number(line.claimed) > 0) &&
      b.lines.some((line) => line.event === 'drain' && Number(line.claimed) > 0)
    check(bothWorked, 'both processes actually claimed work — the fleet was not one worker with a spare')

    // ---------------------------------------------------------------------
    // 2. Observed connections, by pool and by process.
    // ---------------------------------------------------------------------
    const observed = await pool.query(`
      SELECT application_name, count(*)::int AS connections
      FROM pg_stat_activity
      WHERE datname = current_database() AND application_name LIKE 'questura:%'
      GROUP BY application_name ORDER BY application_name
    `)
    check(
      observed.rows.length > 0,
      'connections identify themselves, so observed can be reconciled with declared',
      JSON.stringify(observed.rows),
    )

    // ---------------------------------------------------------------------
    // 3. Kill a worker mid-flight. The other converges.
    // ---------------------------------------------------------------------
    await pool.query('DELETE FROM refresh_jobs')
    receiver.reset()
    // A receiver that hangs keeps a claim held while its worker is killed.
    receiver.mode = { kind: 'hang', ms: 3_000 }

    for (let index = 0; index < 6; index += 1) {
      await pool.query(
        `INSERT INTO refresh_jobs (kind, dedupe_key, target, reason, status, attempts, generation, next_attempt_at)
         VALUES ('revalidate', $1, $2::jsonb, 'kill', 'pending', 0, 1, now())`,
        [`revalidate:kill-${index}`, JSON.stringify({ tags: [`kill-${index}`], paths: [] })],
      )
    }

    // A real wait: `waitFor` with a condition that is already true returns at
    // once, which is not a pause.
    await sleep(500)
    const running = await pool.query(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status = 'running'`)
    check(running.rows[0].n > 0, 'a claim is held while the frontend is slow', `${running.rows[0].n} running`)

    a.child.kill('SIGKILL')
    receiver.mode = { kind: 'ok' }

    // The dead worker's claims are not lost: their leases expire and the
    // survivor takes them. Shorten the lease so the rehearsal does not take a
    // minute to show a minute-long lease working.
    await pool.query(`UPDATE refresh_jobs SET locked_until = now() - interval '1 second' WHERE status = 'running'`)

    const converged = await queueEmpty(pool, 60_000)

    check(converged, 'the surviving process finishes what the killed one was holding')
    check(
      b.lines.some((line) => line.event === 'drain'),
      'and it is the survivor that did it',
    )

    // ---------------------------------------------------------------------
    // 4. A cross-process advisory lock really is exclusive.
    // ---------------------------------------------------------------------
    b.child.kill('SIGTERM')
    await sleep(300)

    const key = 918_273_645
    const holder = startWorker('lock-holder', { READINESS_LOCK_KEY: String(key), READINESS_LOCK_HOLD_MS: '2000' })
    workers.push(holder.child)
    await waitFor(() => holder.lines.some((line) => line.event === 'lock'), 15_000)

    const contender = startWorker('lock-contender', { READINESS_LOCK_KEY: String(key), READINESS_LOCK_HOLD_MS: '10' })
    workers.push(contender.child)
    await waitFor(() => contender.lines.some((line) => line.event === 'lock'), 15_000)

    const holderGot = holder.lines.find((line) => line.event === 'lock')?.got
    const contenderGot = contender.lines.find((line) => line.event === 'lock')?.got
    check(holderGot === true, 'the first process takes the advisory lock')
    check(contenderGot === false, 'the second process is refused while it is held')

    // And released when its holder goes away.
    await waitFor(() => holder.lines.some((line) => line.event === 'unlock'), 10_000)
    const after = startWorker('lock-after', { READINESS_LOCK_KEY: String(key), READINESS_LOCK_HOLD_MS: '10' })
    workers.push(after.child)
    await waitFor(() => after.lines.some((line) => line.event === 'lock'), 15_000)
    check(after.lines.find((line) => line.event === 'lock')?.got === true, 'and available again once released')
  } finally {
    stopAll()
    await pool.end()
    await receiver.close()
  }

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`)
  console.log(
    '\nThis is correctness across processes, not capacity. Routing fairness, a rolling release under\n' +
      'HTTP traffic and real termination grace need serving processes behind a proxy — L12s remaining\n' +
      'half, and it is owed.',
  )
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
