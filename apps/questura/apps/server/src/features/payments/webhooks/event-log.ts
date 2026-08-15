import type { getPayload } from 'payload'
import type Stripe from 'stripe'

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
 *
 * Failure must propagate. A webhook is not safely processed until its event
 * record is durable; acknowledging after a failed write would let a later
 * duplicate repeat side effects without Stripe retrying this delivery.
 */
export async function recordProcessedEvent(
  payload: Awaited<ReturnType<typeof getPayload>>,
  event: Stripe.Event,
  subscriptionId: string | null
) {
  await payload.create({
    collection: 'stripe-webhook-events',
    data: {
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      subscriptionId,
    },
  })
}
