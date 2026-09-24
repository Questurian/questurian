import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { formatAccessDate, formatArticleDate } from './dates.ts'

// `pnpm test` runs under the host's zone; the launch fix plan (item 16) also
// runs it under TZ=UTC and TZ=Pacific/Kiritimati (UTC+14), where half past
// eleven at night UTC is already the next day.
const LATE_UTC = '2030-01-31T23:30:00.000Z'

test('access dates are the UTC day with the month spelled out', () => {
  assert.equal(formatAccessDate(LATE_UTC), 'January 31, 2030')
  assert.equal(formatAccessDate(new Date(LATE_UTC)), 'January 31, 2030')
  assert.equal(formatAccessDate(Date.parse(LATE_UTC)), 'January 31, 2030')
  assert.equal(formatAccessDate('2030-02-01T00:00:00.000Z'), 'February 1, 2030')
})

test('article dates are the UTC day in each style', () => {
  assert.equal(formatArticleDate(LATE_UTC, 'long'), 'January 31, 2030')
  assert.equal(formatArticleDate(LATE_UTC, 'short'), 'Jan 31, 2030')
  assert.equal(formatArticleDate(LATE_UTC, 'monthDay'), 'Jan 31')
  // Early morning UTC is still the previous evening in New York; the article
  // page used to print that day while its header printed the UTC one.
  assert.equal(formatArticleDate('2030-02-01T02:00:00.000Z', 'long'), 'February 1, 2030')
})

// CI runs in UTC only, so the extreme zones are also switched in-process here.
// Node re-reads TZ when it changes; the first assertion proves the switch took.
test('the output does not move with the host zone', () => {
  const original = process.env.TZ
  try {
    // [zone, local day of the month at 23:30Z, local day at 06:00Z], Jan 31 UTC.
    for (const [zone, lateDay, earlyDay] of [
      ['Pacific/Kiritimati', 1, 31], // UTC+14: the late instant is already Feb 1
      ['Etc/GMT+12', 31, 30], // UTC-12: the early instant is still Jan 30
    ]) {
      process.env.TZ = zone
      assert.equal(new Date(LATE_UTC).getDate(), lateDay)
      assert.equal(new Date('2030-01-31T06:00:00.000Z').getDate(), earlyDay)
      assert.equal(formatAccessDate(LATE_UTC), 'January 31, 2030')
      assert.equal(formatAccessDate('2030-01-31T06:00:00.000Z'), 'January 31, 2030')
      assert.equal(formatArticleDate(LATE_UTC, 'short'), 'Jan 31, 2030')
    }
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
})

test('missing or unparseable dates format to null', () => {
  for (const value of [null, undefined, '', 'not a date']) {
    assert.equal(formatAccessDate(value), null)
    assert.equal(formatArticleDate(value, 'short'), null)
  }
})

/**
 * The guard behind "no bare toLocaleDateString() is left": host-zone date
 * formatting anywhere in the client. Anything that formats a date goes through
 * `lib/dates.ts`, which always passes a fixed `timeZone`.
 */
test('no client code formats a date outside lib/dates.ts', () => {
  const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const helper = path.join(srcRoot, 'lib', 'dates.ts')

  function sourceFiles(dir) {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.(ts|tsx)$/.test(name) && full !== helper ? [full] : []
    })
  }

  const offenders = sourceFiles(srcRoot).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line, index) => ({ line, where: `${path.relative(srcRoot, file)}:${index + 1}` }))
      .filter(({ line }) => /\.toLocale(Date|Time)?String\(|Intl\.DateTimeFormat\(/.test(line))
      .map(({ where }) => where)
  )

  assert.deepEqual(offenders, [])
})
