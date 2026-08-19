import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/payments/lib/stripe'
import { getPayload } from 'payload'
import config from '@/payload.config'
import Stripe from 'stripe'
import { APP_CONFIG } from '@/shared/config'
import { logger } from '@/shared/utils/logger'
import { withAdvisoryLock } from '@/shared/utils/advisory-lock'
import { getSubscriptionIdFromEvent, recordProcessedEvent } from '@/payments/webhooks/event-log'
import {
  STRIPE_WEBHOOK_HANDLERS,
  isHandledStripeEventType,
} from '@/payments/webhooks/handled-events'

/**
 * Refuse to buffer more than this from an unauthenticated caller.
 *
 * This route's URL is public and the signature is the only thing that
 * authenticates a caller — but the signature cannot be checked until the whole
 * payload is in memory, so an uncapped `req.text()` lets anyone who knows the
 * URL hold as much server memory as they care to send, in parallel, and never
 * reach the check that would have rejected them.
 *
 * 1 MiB is deliberately far above anything Stripe sends. Stripe publishes no
 * maximum event size, so the number comes from two bounds instead. Real events
 * captured from this account (`payments/__fixtures__/membership-lifecycle.events.json`)
 * run 3.8-5.6 KB, averaging 4.6 KB. The pathological upper bound is metadata:
 * Stripe allows 50 keys of 500 characters per object, about 27 KB, and an event
 * can carry the object plus `previous_attributes`, so even a deliberately
 * stuffed invoice with its inline line items lands well under 100 KB. 1 MiB is
 * ~180x the largest event we have ever received and ~10x that worst case.
 *
 * The asymmetry justifies the generosity: a rejected legitimate event is a
 * refund that never revokes access or a payment that never grants membership,
 * discovered days later. Accepting a 900 KB request costs 900 KB.
 */
const MAX_WEBHOOK_BODY_BYTES = 1_048_576

type BodyRead =
  | { ok: true; body: string }
  | { ok: false; observedBytes: number; declaredBytes: number | null }

/**
 * Read the raw payload, refusing to buffer past the cap.
 *
 * `content-length` is checked first so an honest oversized request costs
 * nothing, but it is only a hint: it is absent under chunked encoding and a
 * hostile caller can simply understate it. So the stream is also metered as it
 * arrives and abandoned the moment the budget is gone — a cap that trusts only
 * the header is not a cap.
 *
 * The bytes are concatenated and decoded once, rather than decoded per chunk,
 * because signature verification is byte-exact: a multi-byte character split
 * across a chunk boundary would decode to two replacement characters and every
 * event containing an accented name or an emoji would fail to verify. Decoding
 * the joined buffer with `TextDecoder` also strips a leading BOM exactly as the
 * `Request.text()` this replaces does, so the string handed to
 * `constructEvent` is identical to the one it received before.
 */
async function readBodyWithinCap(req: NextRequest): Promise<BodyRead> {
  const contentLength = req.headers.get('content-length')
  const declaredBytes = contentLength === null ? null : Number(contentLength)

  if (declaredBytes !== null && Number.isFinite(declaredBytes) && declaredBytes > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, observedBytes: declaredBytes, declaredBytes }
  }

  // No stream to meter (an empty body, or a runtime that already materialised
  // it). `content-length` has been checked, so fall back to the plain read.
  if (!req.body) {
    return { ok: true, body: await req.text() }
  }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let observedBytes = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      observedBytes += value.byteLength

      if (observedBytes > MAX_WEBHOOK_BODY_BYTES) {
        // Drop what we have and stop pulling: holding the chunks while the
        // sender keeps writing is the exact cost this guard exists to avoid.
        chunks.length = 0
        await reader.cancel()
        return { ok: false, observedBytes, declaredBytes }
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const joined = new Uint8Array(observedBytes)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { ok: true, body: new TextDecoder().decode(joined) }
}

export async function POST(req: NextRequest) {
  const read = await readBodyWithinCap(req)

  if (!read.ok) {
    logger.warn('Stripe webhook rejected: body exceeds size cap', {
      observedBytes: read.observedBytes,
      declaredBytes: read.declaredBytes,
      maxBytes: MAX_WEBHOOK_BODY_BYTES,
    })
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const body = read.body
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) {
    logger.warn('Stripe webhook rejected: missing stripe-signature header')
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      APP_CONFIG.stripe.webhookSecret
    )
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  logger.info('Stripe webhook received', { eventId: event.id, eventType: event.type })

  const payload = await getPayload({ config })
  try {
    // The lock makes duplicate detection one operation across all server
    // processes. Without it, two parallel deliveries can both pass the lookup,
    // both run side effects, then race on the unique event record.
    //
    // This lock holds its connection for the whole handler, across every Stripe
    // call and email send. That connection comes from the lock pool in
    // `advisory-lock.ts`, not Payload's, and the per-subscription lock inside
    // `resyncSubscription` reuses this same one — see the note there for why
    // taking either from `pool.max: 20` deadlocked instead of queueing.
    //
    // Throughput is not affected: this key is per *event*, so two different
    // events never wait on each other. The cost is one lock connection per
    // in-flight delivery.
    //
    // If lock-pool exhaustion is ever observed, in increasing order of risk:
    //   1. Raise `LOCK_POOL_MAX`. Postgres allows 100 and this app is nowhere
    //      near it; 10 -> 20 is a one-line doubling.
    //   2. Drop this outer lock and rely on the per-subscription lock inside
    //      `resyncSubscription` plus the unique `eventId`. Every handler
    //      currently funnels into resync, so this is plausible — but it is a
    //      correctness argument about duplicate side effects on the payments
    //      path and needs proving handler by handler, not assuming.
    return await withAdvisoryLock(payload, `stripe:event:${event.id}`, async () => {
      const alreadyProcessed = await payload.find({
        collection: 'stripe-webhook-events',
        where: { eventId: { equals: event.id } },
        limit: 1,
      })

      if (alreadyProcessed.totalDocs > 0) {
        logger.info('Duplicate Stripe event delivery skipped', { eventId: event.id })
        return NextResponse.json({ received: true, duplicate: true })
      }

      // Ordering guard: Stripe does not guarantee delivery order. If we've
      // already processed a newer event for this subscription, don't let this
      // older event overwrite that state.
      const subscriptionId = getSubscriptionIdFromEvent(event)

      if (subscriptionId) {
        const newerEvent = await payload.find({
          collection: 'stripe-webhook-events',
          where: {
            and: [
              { subscriptionId: { equals: subscriptionId } },
              { eventCreated: { greater_than: event.created } },
            ],
          },
          limit: 1,
        })

        if (newerEvent.totalDocs > 0) {
          logger.info('Stale Stripe event skipped: newer event already processed', {
            eventId: event.id,
            subscriptionId,
          })
          // Record it so retries of this stale event are also skipped.
          await recordProcessedEvent(payload, event, subscriptionId)
          return NextResponse.json({ received: true, stale: true })
        }
      }

      if (isHandledStripeEventType(event.type)) {
        await STRIPE_WEBHOOK_HANDLERS[event.type](event)
      } else {
        logger.info('Unhandled Stripe event type', { eventId: event.id, eventType: event.type })
      }

      // Recording is part of successful processing. If storage fails, throw so
      // Stripe retries instead of acknowledging an event we cannot deduplicate.
      await recordProcessedEvent(payload, event, subscriptionId)

      return NextResponse.json({ received: true })
    })
  } catch (error) {
    logger.error('Error processing Stripe webhook', {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
