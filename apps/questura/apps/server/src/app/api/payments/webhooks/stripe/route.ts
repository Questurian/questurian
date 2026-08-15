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
import { handleCheckoutSessionCompleted } from '@/payments/webhooks/handlers/checkout-session'
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from '@/payments/webhooks/handlers/subscription-lifecycle'
import {
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from '@/payments/webhooks/handlers/invoice-payment'

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

      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
          break

        case 'customer.subscription.created':
          await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
          break

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
          break

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
          break

        case 'invoice.payment_succeeded':
          await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
          break

        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
          break

        default:
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
