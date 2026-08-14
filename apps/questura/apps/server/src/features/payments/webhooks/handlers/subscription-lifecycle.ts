import type Stripe from 'stripe'
import { logger } from '@/shared/utils/logger'
import { resyncSubscription } from '@/payments/lib/subscription-resync'

/**
 * Subscription lifecycle webhooks.
 *
 * These carry a full subscription object, and deliberately do not use it: the
 * payload is rendered at the webhook endpoint's API version, which on this
 * account still places `current_period_end` at the subscription root, while
 * the SDK pins a version that puts it on the subscription item. Reading the
 * payload made that difference invisible until it broke. Every handler now
 * takes the id and refetches (ADR-0008).
 */

export async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  logger.info('Processing customer.subscription.created', { subscriptionId: subscription.id })

  await resyncSubscription(subscription.id)
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  logger.info('Processing customer.subscription.updated', {
    subscriptionId: subscription.id,
    payloadStatus: subscription.status,
  })

  await resyncSubscription(subscription.id)
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  logger.info('Processing customer.subscription.deleted', { subscriptionId: subscription.id })

  // A deleted subscription is still retrievable, and still reports the period
  // it was cancelled in, so paid time is honoured the same way as anywhere else.
  await resyncSubscription(subscription.id)
}
