import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Render tests for every template Questura actually sends (launch fix plan,
 * item 4). Each one is rendered as production would configure it and held to
 * the same rules:
 *
 *  - it goes to the right address with a real subject;
 *  - every link is https, on the site or API host, never localhost;
 *  - there is a plain-text part, and it keeps the links;
 *  - dates are written in UTC, whatever zone the host runs in;
 *  - a visitor-typed name is text, never markup.
 *
 * `src/features/emails/index.ts` lists the sent templates; the last test
 * fails if one is added there without a case here.
 */

vi.mock('./email-log', () => ({ recordEmailLog: vi.fn() }))

const SITE = 'https://www.questurian.com'
const API = 'https://api.questurian.com'
const SITE_HOSTS = new Set(['www.questurian.com', 'api.questurian.com'])
const LATE_UTC = new Date('2030-01-31T23:30:00.000Z')
// Typed at sign-up by whoever registers the address.
const HOSTILE_NAME = '<a href="https://evil.example/claim">Claim your prize</a>'

type Sent = { to: string; subject: string; html: string; text: string; replyTo?: string }
type Emails = typeof import('../index')

let emails: Emails
let sent: Sent[]
const payload = {
  sendEmail: vi.fn(async (message: Sent) => {
    sent.push(message)
    return { id: 'test' }
  }),
} as never

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', SITE)
  vi.stubEnv('BACKEND_URL_LOCAL', API)
  vi.stubEnv('EMAIL_REPLY_TO', 'help@questurian.com')
  vi.resetModules()
  emails = await import('../index')
})

afterAll(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

beforeEach(() => {
  sent = []
})

const member = { email: 'reader@example.com', firstName: 'Ada', lastName: 'Lovelace' }

type Case = {
  name: string
  send: (e: Emails) => Promise<unknown>
  to: string
  subject: RegExp
  /** Text the reader must see, UTC dates included. */
  contains: string[]
}

const resetUrl = `${API}/api/visitor-auth/reset-password/tok123?callbackURL=${encodeURIComponent(`${SITE}/auth/reset-password`)}`
const verifyUrl = `${API}/api/visitor-auth/verify-email?token=tok456&callbackURL=${encodeURIComponent('/')}`

const CASES: Case[] = [
  {
    name: 'sendPasswordResetLinkEmail',
    send: (e) => e.sendPasswordResetLinkEmail(payload, { ...member, url: resetUrl }),
    to: 'reader@example.com',
    subject: /reset your questurian password/i,
    contains: [resetUrl],
  },
  {
    name: 'sendVisitorEmailVerificationLinkEmail',
    send: (e) => e.sendVisitorEmailVerificationLinkEmail(payload, { ...member, url: verifyUrl }),
    to: 'reader@example.com',
    subject: /verify/i,
    contains: [verifyUrl],
  },
  {
    name: 'sendPasswordChangedEmail',
    send: (e) => e.sendPasswordChangedEmail(payload, member, LATE_UTC),
    to: 'reader@example.com',
    subject: /password was changed/i,
    contains: ['Thursday, January 31, 2030 at 11:30 PM UTC', `${SITE}/account`],
  },
  {
    name: 'sendEmailChangedNotificationEmail',
    send: (e) =>
      e.sendEmailChangedNotificationEmail(
        payload,
        { oldEmail: 'old@example.com', newEmail: 'new@example.com', firstName: 'Ada' },
        LATE_UTC
      ),
    // The OLD address, never the new one.
    to: 'old@example.com',
    subject: /email address was changed/i,
    contains: ['old@example.com', 'new@example.com', 'January 31, 2030 at 11:30 PM UTC', `${SITE}/account`],
  },
  {
    name: 'sendGoogleAccountLinkedEmail',
    send: (e) => e.sendGoogleAccountLinkedEmail(payload, member, LATE_UTC),
    to: 'reader@example.com',
    subject: /google sign-in was connected/i,
    contains: ['January 31, 2030 at 11:30 PM UTC', `${SITE}/account`],
  },
  {
    name: 'sendSubscriptionCancelledEmail',
    send: (e) =>
      e.sendSubscriptionCancelledEmail(payload, {
        ...member,
        subscriptionType: 'Monthly',
        membershipExpiresAt: LATE_UTC,
        wasImmediate: false,
      }),
    to: 'reader@example.com',
    subject: /cancelled/i,
    contains: ['January 31, 2030'],
  },
  {
    name: 'sendSubscriptionReactivatedEmail',
    send: (e) =>
      e.sendSubscriptionReactivatedEmail(payload, { ...member, subscriptionType: 'Yearly', renewsAt: LATE_UTC }),
    to: 'reader@example.com',
    subject: /reactivated/i,
    contains: ['January 31, 2030'],
  },
  {
    name: 'sendMembershipConfirmationEmail',
    send: (e) =>
      e.sendMembershipConfirmationEmail(payload, {
        ...member,
        subscriptionType: 'Monthly',
        membershipExpiresAt: LATE_UTC,
      }),
    to: 'reader@example.com',
    subject: /subscription is active/i,
    contains: ['January 31, 2030'],
  },
]

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!.replaceAll('&amp;', '&'))

describe.each(CASES)('$name', ({ send, to, subject, contains }) => {
  it('goes to the right address with a real subject and the configured reply-to', async () => {
    await send(emails)

    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe(to)
    expect(sent[0]!.subject).toMatch(subject)
    expect(sent[0]!.replyTo).toBe('help@questurian.com')
  })

  it('links only over https to the site or API host, never localhost', async () => {
    await send(emails)
    const { html, text } = sent[0]!

    for (const href of hrefs(html)) {
      const url = new URL(href)
      expect(url.protocol).toBe('https:')
      expect(SITE_HOSTS.has(url.hostname)).toBe(true)
    }
    expect(html).not.toMatch(/localhost|127\.0\.0\.1/)
    expect(text).not.toMatch(/localhost|127\.0\.0\.1/)
  })

  it('has a plain-text part that carries the content and the links', async () => {
    await send(emails)
    const { html, text } = sent[0]!

    expect(text.length).toBeGreaterThan(80)
    expect(text).not.toMatch(/<[a-z!/]/i)
    for (const href of hrefs(html)) expect(text).toContain(href)
    for (const expected of contains) expect(text).toContain(expected)
  })

  it('writes dates in UTC whatever zone the host runs in', async () => {
    const original = process.env.TZ
    process.env.TZ = 'Pacific/Kiritimati' // UTC+14: 23:30Z is already the next day
    try {
      await send(emails)
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }

    for (const expected of contains) expect(sent[0]!.html.replaceAll('&amp;', '&')).toContain(expected)
    expect(sent[0]!.html).not.toContain('February 1, 2030')
  })
})

describe('visitor-typed values', () => {
  it.each(CASES.filter((c) => c.to === 'reader@example.com'))(
    '$name renders a hostile display name as text',
    async ({ send }) => {
      member.firstName = HOSTILE_NAME
      try {
        await send(emails)
      } finally {
        member.firstName = 'Ada'
      }
      const { html } = sent[0]!

      expect(html).not.toContain('evil.example/claim"')
      expect(hrefs(html).some((href) => href.includes('evil.example'))).toBe(false)
      expect(html).toContain('&lt;a href=&quot;https://evil.example/claim&quot;&gt;')
    }
  )

  it('escapes the addresses in the email-changed notice', async () => {
    await emails.sendEmailChangedNotificationEmail(payload, {
      oldEmail: 'old@example.com',
      newEmail: '"><img src=x>@example.com',
    })

    expect(sent[0]!.html).not.toContain('<img')
  })
})

describe('the sent-template list', () => {
  it('has a render case for every sender the emails feature exports', () => {
    const senders = Object.keys(emails).filter((key) => /^send\w+Email$/.test(key))

    expect(senders.sort()).toEqual(CASES.map((c) => c.name).sort())
  })
})
