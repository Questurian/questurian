import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Member-facing dates are written in UTC, whatever zone the server runs in.
 * `pnpm test:int` runs this file under the host's zone; CI and the launch fix
 * plan (item 16) also run it under TZ=UTC and TZ=Pacific/Kiritimati (UTC+14),
 * where half past eleven at night UTC is already the next day.
 */

vi.mock('@/features/emails/lib/email-log', () => ({ recordEmailLog: vi.fn() }))

import { sendMembershipConfirmationEmail } from '@/features/emails/lib/membership-confirmation'
import { sendSubscriptionCancelledEmail } from '@/features/emails/lib/subscription-cancelled'
import { sendSubscriptionReactivatedEmail } from '@/features/emails/lib/subscription-reactivated'
import { sendEmailChangedNotificationEmail } from '@/features/emails/lib/email-changed-notification'

import { formatAccessDate, formatMemberTimestamp } from './dates'

const LATE_UTC = '2030-01-31T23:30:00.000Z'

describe('formatAccessDate', () => {
  it('writes the UTC day with the month spelled out', () => {
    expect(formatAccessDate(LATE_UTC)).toBe('January 31, 2030')
    expect(formatAccessDate(new Date(LATE_UTC))).toBe('January 31, 2030')
    expect(formatAccessDate(Date.parse(LATE_UTC))).toBe('January 31, 2030')
  })

  it('keeps the first instant of a UTC day on that day', () => {
    expect(formatAccessDate('2030-02-01T00:00:00.000Z')).toBe('February 1, 2030')
  })

  it('returns null for missing or unparseable input', () => {
    expect(formatAccessDate(null)).toBeNull()
    expect(formatAccessDate(undefined)).toBeNull()
    expect(formatAccessDate('')).toBeNull()
    expect(formatAccessDate('not a date')).toBeNull()
  })
})

// CI runs in UTC only, so the extreme zones are also switched in-process here.
// Node re-reads TZ when it changes; the first assertion proves the switch took.
describe('independence from the host zone', () => {
  const original = process.env.TZ

  afterEach(() => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  })

  it.each([
    // [zone, local day of the month at 23:30Z, local day at 06:00Z], Jan 31 UTC.
    ['Pacific/Kiritimati', 1, 31], // UTC+14: the late instant is already Feb 1
    ['Etc/GMT+12', 31, 30], // UTC-12: the early instant is still Jan 30
  ])('writes the UTC day under %s', (zone, lateDay, earlyDay) => {
    process.env.TZ = zone
    expect(new Date(LATE_UTC).getDate()).toBe(lateDay)
    expect(new Date('2030-01-31T06:00:00.000Z').getDate()).toBe(earlyDay)
    expect(formatAccessDate(LATE_UTC)).toBe('January 31, 2030')
    expect(formatAccessDate('2030-01-31T06:00:00.000Z')).toBe('January 31, 2030')
  })
})

describe('formatMemberTimestamp', () => {
  it('writes the UTC moment and names the zone', () => {
    const text = formatMemberTimestamp(LATE_UTC)
    // ICU puts a narrow no-break space before AM/PM in recent Node versions.
    expect(text?.replace(/\s/g, ' ')).toMatch(/^Thursday, January 31, 2030(,| at) 11:30 PM UTC$/)
  })

  it('returns null for an unparseable value', () => {
    expect(formatMemberTimestamp('nope')).toBeNull()
  })
})

describe('member emails', () => {
  const sent: Array<{ subject: string; html: string }> = []
  const payload = {
    sendEmail: vi.fn(async (message: { subject: string; html: string }) => {
      sent.push(message)
    }),
  } as never
  const member = { email: 'member@example.com', firstName: 'Ada', lastName: 'Lovelace' }

  beforeEach(() => {
    sent.length = 0
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cancellation states the access end date in UTC', async () => {
    await sendSubscriptionCancelledEmail(payload, {
      ...member,
      subscriptionType: 'Monthly',
      membershipExpiresAt: new Date(LATE_UTC),
      wasImmediate: false,
    })
    expect(sent[0].html).toContain('Your access will continue until January 31, 2030.')
  })

  it('reactivation states the renewal date in UTC, in both places', async () => {
    await sendSubscriptionReactivatedEmail(payload, {
      ...member,
      subscriptionType: 'Monthly',
      renewsAt: new Date(LATE_UTC),
    })
    await sendSubscriptionReactivatedEmail(payload, { ...member, renewsAt: new Date(LATE_UTC) })
    expect(sent[0].html).toContain('<strong>Next Renewal:</strong> January 31, 2030')
    expect(sent[1].html).toContain('will automatically renew on January 31, 2030.')
  })

  it('confirmation states the period end in UTC', async () => {
    await sendMembershipConfirmationEmail(payload, {
      ...member,
      subscriptionType: 'Monthly',
      membershipExpiresAt: new Date(LATE_UTC),
    })
    expect(sent[0].html).toContain('January 31, 2030')
    expect(sent[0].html).not.toContain('2/1/2030')
  })

  it('the email-changed notice names the zone of its timestamp', async () => {
    await sendEmailChangedNotificationEmail(payload, {
      oldEmail: 'old@example.com',
      newEmail: 'new@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
    expect(sent[0].html).toMatch(/<strong>Changed On:<\/strong> [^<]+ UTC</)
  })
})

/**
 * The guard behind "no bare toLocaleDateString() is left": a host-zone format
 * call anywhere member-facing text is built. `dates.ts` is the one place allowed
 * to format, and it always passes `timeZone`.
 */
describe('no host time zone formatting in member-facing server code', () => {
  const srcRoot = path.resolve(__dirname, '../..')
  const scanned = ['features/emails', 'features/payments'].map((dir) => path.join(srcRoot, dir))

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
    })
  }

  it('has no toLocaleDateString / toLocaleString / toLocaleTimeString calls', () => {
    const offenders = scanned
      .flatMap(sourceFiles)
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, index) => ({ line, where: `${path.relative(srcRoot, file)}:${index + 1}` }))
          .filter(({ line }) => /\.toLocale(Date|Time)?String\(/.test(line))
          .map(({ where }) => where),
      )
    expect(offenders).toEqual([])
  })
})
