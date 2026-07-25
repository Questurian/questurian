import type { getPayload } from 'payload'
import type Stripe from 'stripe'
import { logger } from '@/shared/utils/logger'

/**
 * Extract the subscription ID from subscription lifecycle events.
 * Used for the ordering guard — only these events carry full subscription
 * state that a stale delivery could overwrite.
 */
export function getSubscriptionIdFromEvent(event: Stripe.Event): string | null {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return (event.data.object as Stripe.Subscription).id
    default:
      return null
  }
}

/**
 * Persist a processed event ID so duplicate deliveries can be skipped.
 * A concurrent duplicate delivery can hit the unique constraint on eventId —
 * that just means the other delivery won, so the error is safe to swallow.
 */
export async function recordProcessedEvent(
  payload: Awaited<ReturnType<typeof getPayload>>,
  event: Stripe.Event,
  subscriptionId: string | null
) {
  try {
    await payload.create({
      collection: 'stripe-webhook-events',
      data: {
        eventId: event.id,
        eventType: event.type,
        eventCreated: event.created,
        subscriptionId,
      },
    })
  } catch (error) {
    logger.warn('Could not record processed Stripe event', {
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
