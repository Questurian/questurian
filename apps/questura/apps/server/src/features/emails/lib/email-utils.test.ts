import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Stdout logs must not carry a visitor's address (launch harness D4). They
 * reach the platform's log store, its retention and anyone reading a deploy
 * log. Found in the readiness sandbox's backend log: every send printed the
 * recipient twice, and every failure once more. The address still lives in
 * the email-logs collection, which is where staff look it up.
 */

vi.mock('./email-log', () => ({ recordEmailLog: vi.fn() }))

import { maskEmail, sendEmail } from './email-utils'

const lines: string[] = []

beforeEach(() => {
  lines.length = 0
  for (const method of ['log', 'error', 'warn', 'info'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
    })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

const config = { emailType: 'membership confirmation email', to: 'reader.name@example.com', subject: 'Welcome', html: '<p>hi</p>' }

describe('sendEmail logging', () => {
  it('logs a send without the address', async () => {
    await sendEmail({ sendEmail: vi.fn().mockResolvedValue(undefined) } as never, config)

    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line).not.toContain('reader.name@example.com')
  })

  it('logs a failure without the address', async () => {
    await sendEmail({ sendEmail: vi.fn().mockRejectedValue(new Error('fetch failed')) } as never, config)

    expect(lines.join('\n')).toContain('fetch failed')
    for (const line of lines) expect(line).not.toContain('reader.name@example.com')
  })
})

describe('maskEmail', () => {
  it.each([
    ['reader.name@example.com', 'r***@example.com'],
    ['a@b.co', 'a***@b.co'],
    ['NOT-AN-ADDRESS', '***'],
    ['', '***'],
  ])('%s → %s', (input, expected) => {
    expect(maskEmail(input)).toBe(expected)
  })
})
