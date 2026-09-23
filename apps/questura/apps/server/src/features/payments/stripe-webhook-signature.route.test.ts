import { createHmac } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { headers } from 'next/headers'
import Stripe from 'stripe'

/**
 * Launch harness A1: real Stripe signatures through the real webhook route.
 *
 * `stripe-webhook.route.test.ts` mocks `constructEvent` and the lifecycle
 * simulation replaces it, so until now nothing checked that the route hands
 * Stripe the exact bytes it received. If a framework or adapter change
 * re-serialised the body, every live webhook would fail while every test
 * passed. Here `constructEvent` is Stripe's own and the signatures are made
 * offline with `generateTestHeaderString`, with no network and no API key.
 *
 * Everything after verification is stubbed: the question is only which
 * requests get past the signature check.
 */

const SECRET = 'whsec_offline_signature_test_0123456789'

const state = vi.hoisted(() => ({
  webhookSecret: 'whsec_offline_signature_test_0123456789',
  handled: [] as Array<{ id: string; type: string }>,
}))

vi.mock('@/payments/lib/stripe', async () => {
  const { default: StripeModule } = await import('stripe')
  return { stripe: { webhooks: StripeModule.webhooks } }
})

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    stripe: {
      get webhookSecret() {
        return state.webhookSecret
      },
    },
  },
}))

vi.mock('@/shared/utils/advisory-lock', () => ({
  withAdvisoryLock: (_payload: unknown, _key: string, work: () => Promise<unknown>) => work(),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({ find: async () => ({ totalDocs: 0, docs: [] }) }),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

vi.mock('@/payments/webhooks/event-log', () => ({
  getSubscriptionIdFromEvent: () => null,
  recordProcessedEvent: async (_payload: unknown, event: { id: string; type: string }) => {
    state.handled.push({ id: event.id, type: event.type })
  },
}))

vi.mock('@/payments/webhooks/handled-events', () => ({
  isHandledStripeEventType: () => false,
  STRIPE_WEBHOOK_HANDLERS: {},
}))

import { POST } from '@/app/api/payments/webhooks/stripe/route'

const now = () => Math.floor(Date.now() / 1000)

function eventBody(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_signature_1',
    object: 'event',
    type: 'customer.updated',
    created: now(),
    livemode: false,
    data: { object: { id: 'cus_1', object: 'customer', name: 'Zoë Ångström 🎟️' } },
    ...extra,
  })
}

/** A `stripe-signature` header over exactly these bytes. */
function sign(payload: string | Buffer, options: { secret?: string; timestamp?: number } = {}): string {
  const secret = options.secret ?? SECRET
  const timestamp = options.timestamp ?? now()

  if (typeof payload === 'string') {
    return Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp })
  }

  // Stripe's helper only signs strings, so a body whose bytes are not a plain
  // UTF-8 string is signed by hand, the way Stripe documents the scheme.
  const v1 = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), payload]))
    .digest('hex')
  return `t=${timestamp},v1=${v1}`
}

function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += size) {
        controller.enqueue(bytes.slice(offset, offset + size))
      }
      controller.close()
    },
  })
}

async function deliver(
  body: string | Uint8Array | ReadableStream<Uint8Array>,
  signature: string | null,
): Promise<Response> {
  const requestHeaders = new Headers({ 'content-type': 'application/json' })
  if (signature !== null) requestHeaders.set('stripe-signature', signature)
  vi.mocked(headers).mockResolvedValue(requestHeaders as any)

  return POST(
    new Request('http://localhost:4000/api/payments/webhooks/stripe', {
      method: 'POST',
      body,
      headers: requestHeaders,
      duplex: 'half',
    } as any) as any,
  )
}

describe('Stripe webhook route with real signatures', () => {
  beforeEach(() => {
    state.webhookSecret = SECRET
    state.handled = []
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  describe('accepted', () => {
    it('a correctly signed event', async () => {
      const body = eventBody()
      const response = await deliver(body, sign(body))

      expect(response.status).toBe(200)
      expect(state.handled).toEqual([{ id: 'evt_signature_1', type: 'customer.updated' }])
    })

    // Multi-byte characters split across chunk boundaries: the route must
    // join bytes before decoding, or the accented name breaks the signature.
    it.each([1, 2, 3, 7, 64])('a signed event streamed in %i-byte chunks', async (size) => {
      const body = eventBody()
      const response = await deliver(chunked(new TextEncoder().encode(body), size), sign(body))

      expect(response.status).toBe(200)
    })

    // Stripe's secret-rotation format: one header, several v1 values, any of
    // which may match.
    it('a header carrying several v1 values, one of them right', async () => {
      const body = eventBody()
      const good = sign(body)
      const timestamp = good.split(',')[0]
      const v1 = good.split('v1=')[1]
      const header = `${timestamp},v1=${'0'.repeat(64)},v1=${v1},v1=${'f'.repeat(64)}`

      expect((await deliver(body, header)).status).toBe(200)
    })

    it('an event signed just inside the 300-second tolerance', async () => {
      const body = eventBody()

      expect((await deliver(body, sign(body, { timestamp: now() - 290 }))).status).toBe(200)
    })

    // A leading byte-order mark is dropped by the decode, both in the route
    // and inside `constructEvent` itself (which decodes a Uint8Array with
    // `TextDecoder` before hashing). Stripe never sends one; pinned so a
    // change in either place is noticed rather than discovered live.
    it('a signature over the body without its leading byte-order mark', async () => {
      const body = eventBody()
      const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body)])

      expect((await deliver(new Uint8Array(bytes), sign(body))).status).toBe(200)
    })
  })

  describe('refused', () => {
    it('no stripe-signature header', async () => {
      expect((await deliver(eventBody(), null)).status).toBe(400)
      expect(state.handled).toEqual([])
    })

    it.each([
      ['empty', ''],
      ['garbage', 'nonsense'],
      ['timestamp only', `t=${Math.floor(Date.now() / 1000)}`],
      ['v1 only', `v1=${'a'.repeat(64)}`],
    ])('a %s signature header', async (_label, header) => {
      expect((await deliver(eventBody(), header)).status).toBe(400)
    })

    it('a signature made with another secret', async () => {
      const body = eventBody()

      expect((await deliver(body, sign(body, { secret: 'whsec_someone_else' }))).status).toBe(400)
    })

    it('a signature for a different body', async () => {
      const signed = eventBody()
      const sent = eventBody({ id: 'evt_signature_2' })

      expect((await deliver(sent, sign(signed))).status).toBe(400)
    })

    it('one flipped byte', async () => {
      const body = eventBody()
      const bytes = Buffer.from(body)
      bytes[bytes.length - 3] ^= 0x01

      expect((await deliver(new Uint8Array(bytes), sign(body))).status).toBe(400)
    })

    // The re-serialisation this suite exists for: same JSON, different bytes.
    it.each([
      ['pretty-printed', (body: string) => JSON.stringify(JSON.parse(body), null, 2)],
      ['trailing newline', (body: string) => `${body}\n`],
      ['leading space', (body: string) => ` ${body}`],
      ['keys reordered', (body: string) => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(body)).reverse()))],
      ['unicode escaped', (body: string) => body.replace('ë', '\\u00eb')],
    ])('the same event, %s', async (_label, reserialise) => {
      const body = eventBody()

      expect((await deliver(reserialise(body), sign(body))).status).toBe(400)
    })

    it('a signature older than the 300-second tolerance (a replay)', async () => {
      const body = eventBody()

      expect((await deliver(body, sign(body, { timestamp: now() - 310 }))).status).toBe(400)
    })

    it('a header with only wrong v1 values', async () => {
      const body = eventBody()
      const timestamp = sign(body).split(',')[0]

      expect(
        (await deliver(body, `${timestamp},v1=${'0'.repeat(64)},v1=${'1'.repeat(64)}`)).status,
      ).toBe(400)
    })

    // `v0` is Stripe's test scheme; only `v1` authenticates.
    it('a correct HMAC offered under the v0 scheme', async () => {
      const body = eventBody()
      const header = sign(body).replace('v1=', 'v0=')

      expect((await deliver(body, header)).status).toBe(400)
    })

    // With an empty secret Stripe's HMAC key is the empty string, which anyone
    // can sign with. Production refuses to boot without the secret, but the
    // route must not rely on that alone.
    it('everything, when no webhook secret is configured', async () => {
      state.webhookSecret = ''
      const body = eventBody()

      const response = await deliver(body, sign(body, { secret: '' }))

      expect(response.status).toBe(503)
      expect(state.handled).toEqual([])
    })
  })

  // Recorded, not endorsed: Stripe's tolerance only bounds the past. A
  // future timestamp still needs the secret, so this is not a bypass, but it
  // is why the replay window cannot be reasoned about from `t=` alone.
  it('accepts a correctly signed event dated in the future (Stripe behaviour, pinned)', async () => {
    const body = eventBody()

    expect((await deliver(body, sign(body, { timestamp: now() + 3_600 }))).status).toBe(200)
  })
})
