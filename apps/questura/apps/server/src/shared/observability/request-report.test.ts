import { describe, expect, it, vi } from 'vitest'

import {
  countPoolStatements,
  noteOnRequest,
  requestDiagnosticsEnabled,
  serverTimingHeader,
  withRequestReport,
} from './request-report'

function fakePool() {
  const client = { query: vi.fn(async () => ({ rows: [] })) }
  return {
    query: vi.fn(async () => ({ rows: [] })),
    connect: vi.fn(async () => client),
    client,
  }
}

describe('countPoolStatements', () => {
  it('counts statements sent through the pool', async () => {
    const pool = fakePool()
    countPoolStatements(pool)

    const { report } = await withRequestReport(async () => {
      await pool.query()
      await pool.query()
    })

    expect(report.statements).toBe(2)
  })

  // Payload runs its operations in transactions, which take a client out of
  // the pool and never touch pool.query again. Counting only at the pool
  // reported zero statements for a page that sent hundreds.
  it('counts statements sent through a pooled client', async () => {
    const pool = fakePool()
    countPoolStatements(pool)

    const { report } = await withRequestReport(async () => {
      const client = await pool.connect()
      await client.query()
      await client.query()
      await client.query()
    })

    expect(report.statements).toBe(3)
  })

  it('counts each statement once however often the pool is re-patched', async () => {
    const pool = fakePool()
    countPoolStatements(pool)
    countPoolStatements(pool)
    countPoolStatements(pool)

    const { report } = await withRequestReport(async () => {
      await pool.query()
    })

    expect(report.statements).toBe(1)
  })

  it('counts nothing outside a measured request', async () => {
    const pool = fakePool()
    countPoolStatements(pool)

    await pool.query()

    const { report } = await withRequestReport(async () => {})
    expect(report.statements).toBe(0)
  })
})

describe('requestDiagnosticsEnabled', () => {
  it('refuses a caller-supplied header in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_API_DIAGNOSTICS', '')

    expect(requestDiagnosticsEnabled(new Headers({ 'x-questura-diagnostics': '1' }))).toBe(false)

    vi.unstubAllEnvs()
  })

  it('honours the operator switch anywhere', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_API_DIAGNOSTICS', '1')

    expect(requestDiagnosticsEnabled(undefined)).toBe(true)

    vi.unstubAllEnvs()
  })
})

describe('serverTimingHeader', () => {
  it('reports statements, cumulative time and whatever the handler noted', async () => {
    const { report } = await withRequestReport(async () => {
      noteOnRequest('reads', 43)
      noteOnRequest('peak', '6/6')
    })
    report.statements = 382
    report.statementMs = 5438

    const header = serverTimingHeader(report)

    expect(header).toContain('sql;dur=5438;desc="382 statements, cumulative"')
    expect(header).toContain('reads;desc="43"')
    expect(header).toContain('peak;desc="6/6"')
  })
})
