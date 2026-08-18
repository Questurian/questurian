import type { CollectionConfig } from 'payload'

/**
 * Records every Stripe webhook event we have processed.
 * Used by the webhook route to skip duplicate deliveries (Stripe retries)
 * and to ignore out-of-order subscription events that would overwrite newer state.
 * Nightly prune drops rows older than 30 days (`event-retention.ts`).
 */
export const StripeWebhookEvents: CollectionConfig = {
  slug: 'stripe-webhook-events',
  admin: {
    hidden: true,
  },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'eventId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'eventType',
      type: 'text',
      required: true,
    },
    {
      name: 'eventCreated',
      type: 'number',
      required: true,
      index: true,
    },
    {
      name: 'subscriptionId',
      type: 'text',
      index: true,
    },
  ],
}
