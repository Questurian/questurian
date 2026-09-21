import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * What one public request actually cost, counted rather than timed.
 *
 * The audit could say a homepage took about a second on a laptop and could not
 * say why, because nothing counted the statements behind it. A stopwatch on a
 * developer machine against scratch data measures the machine. Statement
 * counts, document reads and peak concurrency are properties of the code and
 * mean the same thing wherever it runs, which is what makes them worth
 * reporting from production later.
 *
 * Off unless asked for. `PUBLIC_API_DIAGNOSTICS=1` turns the response header
 * on; outside that the counters still run (they are two integer increments)
 * but nothing is emitted, so nothing about the response changes.
 *
 * How to read what comes out: `apps/questura/docs/measuring-the-backend.md`.
 */

export type RequestReport = {
  startedAt: number
  /** SQL statements sent through Payload's pool during this request. */
  statements: number
  /**
   * Milliseconds spent inside those statements, summed.
   *
   * Cumulative, not elapsed: concurrent statements each contribute their own
   * duration, so this exceeds the request's wall time whenever reads overlap.
   * That ratio is the useful part — it says how many statements were in flight
   * at once, which is the thing a connection pool actually runs out of.
   */
  statementMs: number
  /** Whatever the handler chose to record, e.g. page read stats. */
  notes: Record<string, number | string>
}

const reportStore = new AsyncLocalStorage<RequestReport>()

export function currentRequestReport(): RequestReport | undefined {
  return reportStore.getStore()
}

/** Record a named number or label on the current request, if one is being measured. */
export function noteOnRequest(key: string, value: number | string): void {
  const report = reportStore.getStore()
  if (report) report.notes[key] = value
}

export async function withRequestReport<T>(
  run: () => Promise<T>,
): Promise<{ result: T; report: RequestReport }> {
  const report: RequestReport = {
    startedAt: Date.now(),
    statements: 0,
    statementMs: 0,
    notes: {},
  }

  const result = await reportStore.run(report, run)
  return { result, report }
}

type Queryable = {
  query: (...args: unknown[]) => unknown
  /**
   * The unwrapped `query`, kept so a re-patch rebuilds from the original
   * rather than wrapping a wrapper. A dev server re-evaluates this module on
   * every edit while the pool outlives all of them; without this, each reload
   * would add a layer and every statement would be counted once per layer.
   */
  __questuraOriginalQuery?: (...args: unknown[]) => unknown
}

type QueryablePool = Queryable & {
  connect?: (...args: unknown[]) => Promise<Queryable>
  __questuraOriginalConnect?: (...args: unknown[]) => Promise<Queryable>
}

/** Wrap one `query` function so it reports to whichever request is active. */
function countQueries(target: Queryable): void {
  if (typeof target.query !== 'function') return

  const original = target.__questuraOriginalQuery ?? target.query.bind(target)
  target.__questuraOriginalQuery = original

  target.query = (...args: unknown[]) => {
    const report = reportStore.getStore()
    if (!report) return original(...args)

    report.statements += 1
    const startedAt = Date.now()
    const settled = original(...args)

    if (settled && typeof (settled as Promise<unknown>).then === 'function') {
      return Promise.resolve(settled).finally(() => {
        report.statementMs += Date.now() - startedAt
      })
    }

    report.statementMs += Date.now() - startedAt
    return settled
  }
}

/**
 * Count every statement Payload sends, through the pool and through pooled
 * clients both.
 *
 * Counting at the pool alone reported zero: Payload runs its operations in
 * transactions, which take a client out of the pool with `connect()` and then
 * never touch `pool.query` again. The statements worth counting are exactly
 * the ones with no call site in this repository — the relationship fan-out the
 * audit measured at 428 queries for one city page — so the count has to live
 * where they actually pass.
 */
export function countPoolStatements(pool: unknown): void {
  const target = pool as QueryablePool | undefined
  if (!target || typeof target.query !== 'function') return

  if (typeof target.connect === 'function') {
    const connect = target.__questuraOriginalConnect ?? target.connect.bind(target)
    target.__questuraOriginalConnect = connect

    target.connect = async (...args: unknown[]) => {
      const client = await connect(...args)
      countQueries(client)
      return client
    }
  }

  countQueries(target)
}

/**
 * Whether this response should carry its counts.
 *
 * `PUBLIC_API_DIAGNOSTICS=1` is the operator's switch and works anywhere. The
 * request header is a convenience for a developer with a dev server already
 * running, and is refused in production: what a request costs is operational
 * detail, and whether to publish it is not the caller's decision.
 */
export function requestDiagnosticsEnabled(headers?: Headers): boolean {
  if (process.env.PUBLIC_API_DIAGNOSTICS === '1') return true
  if (process.env.NODE_ENV === 'production') return false

  return headers?.get('x-questura-diagnostics') === '1'
}

/**
 * `Server-Timing`, because browsers and curl both already read it and it costs
 * one header rather than a shape change to every response body.
 */
export function serverTimingHeader(report: RequestReport): string {
  const parts = [
    `total;dur=${Date.now() - report.startedAt}`,
    // No comma inside the quoted description: `Server-Timing` is a
    // comma-separated list, a quoted comma is legal, and plenty of parsers
    // split on the comma anyway. Ours did.
    `sql;dur=${report.statementMs};desc="${report.statements} statements (cumulative)"`,
  ]

  for (const [key, value] of Object.entries(report.notes)) {
    parts.push(`${key};desc="${String(value)}"`)
  }

  return parts.join(', ')
}
