import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  end: vi.fn(),
}))

vi.mock('pg', () => ({
  Pool: class {
    query = mocks.query
    end = mocks.end
  },
}))

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    database: { uri: 'postgres://localhost:5432/test' },
  },
}))

import { ensureVisitorAuthSchema } from './ensure-visitor-auth-schema'

function executedSql(): string[] {
  return mocks.query.mock.calls.map(([sql]) => String(sql))
}

describe('ensureVisitorAuthSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.end.mockResolvedValue(undefined)
    // Default: profile table present, no orphans.
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ present: true }] }
      if (sql.includes('orphan_count')) {
        return { rows: [{ orphan_count: '0', sample_ids: null }] }
      }
      return { rows: [] }
    })
  })

  it('never issues a DELETE against visitor_profiles', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ present: true }] }
      if (sql.includes('orphan_count')) {
        return { rows: [{ orphan_count: '3', sample_ids: ['1', '2', '3'] }] }
      }
      return { rows: [] }
    })

    await ensureVisitorAuthSchema()

    const sql = executedSql().join('\n')
    // `ON DELETE CASCADE` legitimately appears in the auth-table DDL, so assert
    // on mutating statements rather than on the bare keyword.
    expect(sql).not.toMatch(/DELETE\s+FROM/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
    expect(sql).not.toMatch(/\bUPDATE\s+"?visitor_profiles"?/i)
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i)
    // Nothing at all may write to the Payload-owned profile table.
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"?visitor_profiles"?/i)
  })

  it('retains orphaned profiles and warns with a row count', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ present: true }] }
      if (sql.includes('orphan_count')) {
        return { rows: [{ orphan_count: '2', sample_ids: ['41', '42'] }] }
      }
      return { rows: [] }
    })

    await ensureVisitorAuthSchema()

    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('2 orphaned visitor_profiles')
    expect(message).toContain('41, 42')
    warn.mockRestore()
  })

  it('stays quiet when there are no orphans', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await ensureVisitorAuthSchema()

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('skips the orphan probe when visitor_profiles does not exist yet', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ present: false }] }
      return { rows: [] }
    })

    await ensureVisitorAuthSchema()

    expect(executedSql().some((sql) => sql.includes('orphan_count'))).toBe(false)
  })

  it('still creates the Better Auth tables idempotently', async () => {
    await ensureVisitorAuthSchema()

    const sql = executedSql().join('\n')
    for (const table of [
      'visitor_auth_users',
      'visitor_auth_sessions',
      'visitor_auth_accounts',
      'visitor_auth_verifications',
      'visitor_auth_rate_limits',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`)
    }
  })

  it('releases the pool even when a query fails', async () => {
    mocks.query.mockRejectedValueOnce(new Error('boom'))

    await expect(ensureVisitorAuthSchema()).rejects.toThrow('boom')
    expect(mocks.end).toHaveBeenCalledTimes(1)
  })
})
