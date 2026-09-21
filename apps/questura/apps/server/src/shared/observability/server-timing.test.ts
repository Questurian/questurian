import { describe, expect, it } from 'vitest'

import { noteOnRequest, serverTimingHeader, withRequestReport } from './request-report'

/**
 * `Server-Timing` is a comma-separated list. A comma inside a quoted
 * description is legal, and plenty of parsers split on the comma anyway — the
 * measurement harness in `scripts/measure-public-api.ts` did, and silently
 * lost the statement count for every endpoint.
 */
describe('serverTimingHeader', () => {
  it('puts no comma inside a quoted description', async () => {
    const { report } = await withRequestReport(async () => {
      noteOnRequest('peak', '6/6')
      noteOnRequest('search', 'index')
    })
    report.statements = 382
    report.statementMs = 5438

    const header = serverTimingHeader(report)

    for (const quoted of header.matchAll(/"([^"]*)"/g)) {
      expect(quoted[1], `"${quoted[1]}" must not contain a comma`).not.toContain(',')
    }
  })

  it('survives a naive comma split with every entry intact', async () => {
    const { report } = await withRequestReport(async () => {
      noteOnRequest('reads', 43)
      noteOnRequest('peak', '6/6')
    })
    report.statements = 382

    const names = serverTimingHeader(report)
      .split(',')
      .map((part) => part.trim().split(';')[0])

    expect(names).toEqual(['total', 'sql', 'pool', 'reads', 'peak'])
  })
})
