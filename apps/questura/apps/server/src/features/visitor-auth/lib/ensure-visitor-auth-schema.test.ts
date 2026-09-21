import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  end: vi.fn(),
  isProduction: false,
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
    get isProduction() {
      return mocks.isProduction
    },
  },
}))

import {
  ensureVisitorAuthSchema,
  visitorAuthSchemaMode,
} from './ensure-visitor-auth-schema'

function executedSql(): string[] {
  return mocks.query.mock.calls.map(([sql]) => String(sql))
}

function allTablesPresent() {
  return {
    visitor_auth_users: true,
    visitor_auth_sessions: true,
    visitor_auth_accounts: true,
    visitor_auth_verifications: true,
    visitor_auth_rate_limits: true,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isProduction = false
  mocks.end.mockResolvedValue(undefined)
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('to_regclass')) return { rows: [allTablesPresent()] }
    return { rows: [] }
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('visitorAuthSchemaMode', () => {
  // A process that issues DDL every time it starts is a different thing on a
  // long-lived server than on one that sleeps and wakes in front of a reader.
  it('creates outside production and only checks inside it', () => {
    mocks.isProduction = false
    expect(visitorAuthSchemaMode()).toBe('create')

    mocks.isProduction = true
    expect(visitorAuthSchemaMode()).toBe('validate')
  })

  it('lets an operator force either mode', () => {
    mocks.isProduction = true
    vi.stubEnv('VISITOR_AUTH_SCHEMA_GUARD', 'create')
    expect(visitorAuthSchemaMode()).toBe('create')

    mocks.isProduction = false
    vi.stubEnv('VISITOR_AUTH_SCHEMA_GUARD', 'validate')
    expect(visitorAuthSchemaMode()).toBe('validate')
  })

  it('ignores a value it does not recognise', () => {
    mocks.isProduction = true
    vi.stubEnv('VISITOR_AUTH_SCHEMA_GUARD', 'yes please')
    expect(visitorAuthSchemaMode()).toBe('validate')
  })
})

describe('ensureVisitorAuthSchema in development', () => {
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

  it('never issues a DELETE against visitor_profiles', async () => {
    await ensureVisitorAuthSchema()

    const sql = executedSql().join('\n')
    // `ON DELETE CASCADE` legitimately appears in the auth-table DDL, so assert
    // on mutating statements rather than on the bare keyword.
    expect(sql).not.toMatch(/DELETE\s+FROM/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
    expect(sql).not.toMatch(/\bUPDATE\s+"?visitor_profiles"?/i)
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i)
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"?visitor_profiles"?/i)
  })

  // The scan of the table holding Stripe linkage is a diagnostic, not a
  // precondition for serving. It moved to `pnpm audit:visitor-auth-orphans`.
  it('no longer scans visitor_profiles at boot', async () => {
    await ensureVisitorAuthSchema()

    expect(executedSql().some((sql) => sql.includes('orphan_count'))).toBe(false)
  })

  it('releases the pool even when a query fails', async () => {
    mocks.query.mockRejectedValueOnce(new Error('boom'))

    await expect(ensureVisitorAuthSchema()).rejects.toThrow('boom')
    expect(mocks.end).toHaveBeenCalledTimes(1)
  })
})

describe('ensureVisitorAuthSchema in production', () => {
  beforeEach(() => {
    mocks.isProduction = true
  })

  it('checks the tables in one statement and issues no DDL', async () => {
    await ensureVisitorAuthSchema()

    const sql = executedSql()
    expect(sql).toHaveLength(1)
    expect(sql[0]).toContain('to_regclass')
    expect(sql.join('\n')).not.toMatch(/CREATE TABLE/i)
    expect(sql.join('\n')).not.toMatch(/CREATE INDEX/i)
  })

  // Creating the table at boot is what hides the missing migration.
  it('fails the boot and names what is missing', async () => {
    mocks.query.mockImplementation(async () => ({
      rows: [{ ...allTablesPresent(), visitor_auth_sessions: false }],
    }))

    await expect(ensureVisitorAuthSchema()).rejects.toThrow(/visitor_auth_sessions/)
    await expect(ensureVisitorAuthSchema()).rejects.toThrow(/pnpm db:migrate/)
  })

  it('releases the pool when the check fails', async () => {
    mocks.query.mockImplementation(async () => ({
      rows: [{ ...allTablesPresent(), visitor_auth_users: false }],
    }))

    await expect(ensureVisitorAuthSchema()).rejects.toThrow()
    expect(mocks.end).toHaveBeenCalled()
  })
})
