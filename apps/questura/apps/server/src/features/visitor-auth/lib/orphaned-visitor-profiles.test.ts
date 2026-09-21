import { describe, expect, it, vi } from 'vitest'

import {
  describeOrphanReport,
  findOrphanedVisitorProfiles,
} from './orphaned-visitor-profiles'

function pool(responses: (sql: string) => unknown) {
  return { query: vi.fn(async (sql: string) => ({ rows: [responses(sql)] })) as never }
}

describe('findOrphanedVisitorProfiles', () => {
  it('counts orphans and samples their ids', async () => {
    const db = pool((sql) =>
      sql.includes('to_regclass')
        ? { present: true }
        : { orphan_count: '2', sample_ids: ['41', '42'] },
    )

    expect(await findOrphanedVisitorProfiles(db)).toEqual({
      tablePresent: true,
      orphanCount: 2,
      sampleIds: ['41', '42'],
    })
  })

  it('skips the scan when visitor_profiles does not exist yet', async () => {
    const db = pool(() => ({ present: false }))

    expect(await findOrphanedVisitorProfiles(db)).toEqual({
      tablePresent: false,
      orphanCount: 0,
      sampleIds: [],
    })
    expect(db.query).toHaveBeenCalledTimes(1)
  })

  // These rows carry Stripe linkage and paid entitlement, with no FK, no
  // soft-delete and no audit behind them. Reporting keeps the diagnostic
  // without the loss.
  it('never issues a mutating statement', async () => {
    const db = pool((sql) =>
      sql.includes('to_regclass')
        ? { present: true }
        : { orphan_count: '5', sample_ids: [] },
    )

    await findOrphanedVisitorProfiles(db)

    const sql = (db.query as unknown as { mock: { calls: string[][] } }).mock.calls
      .map(([statement]) => statement)
      .join('\n')
    expect(sql).not.toMatch(/DELETE\s+FROM/i)
    expect(sql).not.toMatch(/\bUPDATE\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
  })
})

describe('describeOrphanReport', () => {
  it('says so when there is nothing to report', () => {
    expect(
      describeOrphanReport({ tablePresent: true, orphanCount: 0, sampleIds: [] }),
    ).toContain('No orphaned')
  })

  it('states that the rows were kept, and why', () => {
    const message = describeOrphanReport({
      tablePresent: true,
      orphanCount: 2,
      sampleIds: ['41', '42'],
    })

    expect(message).toContain('2 orphaned visitor_profiles')
    expect(message).toContain('retained')
    expect(message).toContain('41, 42')
  })
})
