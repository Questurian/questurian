import type { ErrorEvent } from '@sentry/nextjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type SentryClient,
  initErrorReporting,
  reportClientError,
  reportRequestError,
  scrubBreadcrumb,
  scrubEvent,
  sentryOptions,
  setSentryClientForTests,
} from './error-reporting'

/**
 * The scrubber is the one thing between a session cookie and a third party,
 * so it is tested on the shape Sentry actually builds, not on a toy.
 */

function fakeSentry() {
  const tags: Record<string, string> = {}
  const scope = {
    setTag: vi.fn((key: string, value: string) => {
      tags[key] = value
    }),
    setTags: vi.fn((values: Record<string, string>) => Object.assign(tags, values)),
    setContext: vi.fn(),
    setFingerprint: vi.fn(),
  }
  const client = {
    init: vi.fn(),
    withScope: vi.fn((fn: (s: typeof scope) => unknown) => fn(scope)),
    captureRequestError: vi.fn(),
    captureMessage: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn(async () => true),
  }
  return { client, scope, tags }
}

// Built, not written: a literal would trip secret scanning.
const FAKE_KEY = ['sk', 'live', 'abcdefgh1234'].join('_')

let logLines: Array<Record<string, unknown>>

beforeEach(() => {
  logLines = []
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logLines.push(JSON.parse(String(line)))
  })
})

afterEach(() => {
  setSentryClientForTests(null)
  vi.restoreAllMocks()
})

describe('sentryOptions', () => {
  it('is null without a DSN, so nothing loads and nothing is sent', () => {
    expect(sentryOptions({})).toBeNull()
    expect(sentryOptions({ SENTRY_DSN: '   ' })).toBeNull()
  })

  it('never sends default PII and does not switch tracing on', () => {
    const options = sentryOptions({ SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1', NODE_ENV: 'production' })!
    expect(options.sendDefaultPii).toBe(false)
    expect(options).not.toHaveProperty('tracesSampleRate')
    expect(options.environment).toBe('production')
  })

  it('takes the environment and the release from the environment', () => {
    const options = sentryOptions({
      SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: 'staging',
      QUESTURA_RELEASE_SHA: 'abc1234',
    })!
    expect(options.environment).toBe('staging')
    expect(options.release).toBe('abc1234')
  })
})

describe('initErrorReporting', () => {
  it('does nothing without a DSN', async () => {
    expect(await initErrorReporting({})).toBe(false)
    expect(logLines).toEqual([])
  })
})

describe('scrubEvent', () => {
  const event = {
    type: undefined,
    message: 'failed for reader@example.com',
    request: {
      url: 'https://api.questurian.com/api/visitor-auth/reset-password?token=secret-reset-token',
      query_string: 'token=secret-reset-token',
      cookies: { 'better-auth.session_token': 'abc' },
      data: { password: 'hunter2', email: 'reader@example.com' },
      env: { REMOTE_ADDR: '192.0.2.1' },
      headers: {
        cookie: 'better-auth.session_token=abc',
        authorization: 'Bearer abcdefghijkl',
        'stripe-signature': 't=1700000000,v1=0123456789abcdef',
        'x-forwarded-for': '192.0.2.1',
        'cf-connecting-ip': '192.0.2.1',
        'user-agent': 'Mozilla/5.0',
        'x-request-id': 'req-12345678',
      },
    },
    user: { id: 'visitor-1', email: 'reader@example.com', ip_address: '192.0.2.1', username: 'reader' },
    extra: { email: 'reader@example.com', detail: `key ${FAKE_KEY}` },
    contexts: { response: { headers: { 'set-cookie': 'payload-token=xyz' } } },
    tags: { note: 'reader@example.com' },
    exception: {
      values: [
        {
          type: 'Error',
          value: 'no account for reader@example.com',
          stacktrace: {
            frames: [
              {
                filename: 'app.js',
                vars: { password: 'hunter2' },
                context_line: "const to = 'reader@example.com'",
                pre_context: ['// reader@example.com'],
                post_context: [FAKE_KEY],
              },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      { category: 'http', data: { url: 'https://api.stripe.com/v1/customers?email=reader@example.com' } },
      { category: 'console', message: 'sent to reader@example.com' },
    ],
  } as unknown as ErrorEvent

  const scrubbed = scrubEvent(event)
  const serialized = JSON.stringify(scrubbed)

  it.each(['reader@example.com', 'secret-reset-token', 'hunter2', 'abcdefghijkl', 'session_token', 'payload-token=xyz',
    '192.0.2.1', FAKE_KEY, '0123456789abcdef'])('sends no %s', (needle) => {
    expect(serialized).not.toContain(needle)
  })

  it('drops cookies, bodies, the query string and the environment of the request', () => {
    expect(scrubbed.request).not.toHaveProperty('cookies')
    expect(scrubbed.request).not.toHaveProperty('data')
    expect(scrubbed.request).not.toHaveProperty('env')
    expect(scrubbed.request?.query_string).toBe('[redacted]')
    expect(scrubbed.request?.url).toBe('https://api.questurian.com/api/visitor-auth/reset-password')
  })

  it('keeps only allowlisted headers', () => {
    expect(scrubbed.request?.headers).toEqual({ 'user-agent': 'Mozilla/5.0', 'x-request-id': 'req-12345678' })
  })

  it('keeps the user id and nothing else about the user', () => {
    expect(scrubbed.user).toEqual({ id: 'visitor-1' })
  })

  it('drops local variables and redacts the source lines around a frame', () => {
    const frame = scrubbed.exception!.values![0].stacktrace!.frames![0]
    expect(frame).not.toHaveProperty('vars')
    expect(frame.context_line).toBe("const to = '[email]'")
    expect(scrubbed.exception!.values![0].value).toBe('no account for [email]')
  })

  it('does not mutate the event it was given', () => {
    expect(event.request?.cookies).toBeDefined()
    expect(event.user?.email).toBe('reader@example.com')
  })

  it('strips the query from breadcrumb URLs', () => {
    expect(scrubBreadcrumb({ data: { url: 'https://x.test/a?token=1' } })?.data?.url).toBe('https://x.test/a')
  })
})

const request = {
  path: '/api/me?token=secret-reset-token',
  method: 'GET',
  headers: {
    'x-request-id': 'req-forced-0002',
    cookie: 'better-auth.session_token=abc',
    'user-agent': 'Mozilla/5.0',
  },
}
const context = {
  routerKind: 'App Router',
  routePath: '/api/me',
  routeType: 'route',
  revalidateReason: undefined,
} as const

describe('reportRequestError', () => {
  it('logs a forced error exactly once, redacted, with the request id, when Sentry is off', () => {
    reportRequestError(new Error('boom for reader@example.com'), request, context)

    expect(logLines).toHaveLength(1)
    const [line] = logLines
    expect(line.level).toBe('error')
    expect(line.requestId).toBe('req-forced-0002')
    expect(line.path).toBe('/api/me')
    expect(line.routePath).toBe('/api/me')
    expect(JSON.stringify(line)).not.toContain('reader@example.com')
    expect(JSON.stringify(line)).not.toContain('secret-reset-token')
    expect(JSON.stringify(line)).not.toContain('session_token')
  })

  it('sends exactly one Sentry report, tagged with the request id, without the cookie or query', () => {
    const { client, tags } = fakeSentry()
    setSentryClientForTests(client as unknown as SentryClient)
    const error = new Error('boom')

    reportRequestError(error, request, context)

    expect(logLines).toHaveLength(1)
    expect(client.captureRequestError).toHaveBeenCalledTimes(1)
    expect(tags.request_id).toBe('req-forced-0002')
    const [sentError, sentRequest, sentContext] = client.captureRequestError.mock.calls[0]
    expect(sentError).toBe(error)
    expect(sentRequest.path).toBe('/api/me')
    expect(sentRequest.headers).toEqual({ 'x-request-id': 'req-forced-0002', 'user-agent': 'Mozilla/5.0' })
    expect(sentContext).toBe(context)
  })

  it('still logs when the SDK throws, and does not throw itself', () => {
    const { client } = fakeSentry()
    client.withScope.mockImplementation(() => {
      throw new Error('sdk broke')
    })
    setSentryClientForTests(client as unknown as SentryClient)

    expect(() => reportRequestError(new Error('boom'), request, context)).not.toThrow()
    expect(logLines).toHaveLength(1)
  })
})

describe('reportClientError', () => {
  const report = {
    source: 'browser' as const,
    boundary: 'global-error',
    message: 'Cannot read properties of undefined (reader@example.com)',
    path: '/rome?email=reader@example.com',
    digest: '4242',
    requestId: 'ray-12345678',
  }

  it('logs one redacted line', () => {
    reportClientError(report, 'req-beacon-0001')
    expect(logLines).toHaveLength(1)
    expect(logLines[0].path).toBe('/rome')
    expect(logLines[0].requestId).toBe('ray-12345678')
    expect(logLines[0].reportRequestId).toBe('req-beacon-0001')
    expect(JSON.stringify(logLines[0])).not.toContain('reader@example.com')
  })

  it('sends one Sentry message tagged as the client, with its request id', () => {
    const { client, tags } = fakeSentry()
    setSentryClientForTests(client as unknown as SentryClient)

    reportClientError(report)

    expect(client.captureMessage).toHaveBeenCalledTimes(1)
    expect(client.captureMessage.mock.calls[0][0]).toBe('[browser] Cannot read properties of undefined ([email])')
    expect(tags).toMatchObject({ service: 'questura-client', source: 'browser', request_id: 'ray-12345678', digest: '4242' })
  })
})
