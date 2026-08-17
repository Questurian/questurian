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

export async function POST(req: NextRequest) {
  const body = await req.text()
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
