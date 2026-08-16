import type Stripe from 'stripe'
import { handleCheckoutSessionCompleted } from './handlers/checkout-session'
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from './handlers/subscription-lifecycle'
import { handleInvoicePaymentSucceeded, handleInvoicePaymentFailed } from './handlers/invoice-payment'
import {
  handleChargeRefunded,
  handleDisputeCreated,
  handleDisputeClosed,
} from './handlers/charge-revocation'

/**
 * The Stripe events this app acts on, and the handler for each.
 *
 * Why this is a map and not a `switch`
 * ------------------------------------
 * A handler only ever runs if Stripe is configured to *send* its event, and
 * nothing in the code can see that configuration. `charge.refunded` and
 * `charge.dispute.*` were handled here for months while the live endpoint had
 * never had them enabled — so every refund and every chargeback silently kept
 * the visitor's access, and no test could have caught it because the code was
 * correct. The gap was in the Dashboard.
 *
 * Deriving the expected event list from the dispatch itself means
 * `scripts/verify-stripe-webhook-events.ts` can diff *this* against the live
 * endpoint and name the difference. A `switch` would have needed the list
 * written down twice, which is how the two drift apart again.
 */
export const STRIPE_WEBHOOK_HANDLERS = {
  'checkout.session.completed': (event) =>
    handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session),

  'customer.subscription.created': (event) =>
    handleSubscriptionCreated(event.data.object as Stripe.Subscription),

  'customer.subscription.updated': (event) =>
    handleSubscriptionUpdated(event.data.object as Stripe.Subscription),

  'customer.subscription.deleted': (event) =>
    handleSubscriptionDeleted(event.data.object as Stripe.Subscription),

  'invoice.payment_succeeded': (event) =>
    handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice),

  'invoice.payment_failed': (event) =>
    handleInvoicePaymentFailed(event.data.object as Stripe.Invoice),

  'charge.refunded': (event) => handleChargeRefunded(event.data.object as Stripe.Charge),

  'charge.dispute.created': (event) => handleDisputeCreated(event.data.object as Stripe.Dispute),

  'charge.dispute.closed': (event) => handleDisputeClosed(event.data.object as Stripe.Dispute),
} satisfies Record<string, (event: Stripe.Event) => Promise<unknown>>

export type HandledStripeEventType = keyof typeof STRIPE_WEBHOOK_HANDLERS

/** Exactly the events the live webhook endpoint must have enabled. */
export const HANDLED_STRIPE_EVENT_TYPES = Object.keys(
  STRIPE_WEBHOOK_HANDLERS
) as HandledStripeEventType[]

export function isHandledStripeEventType(type: string): type is HandledStripeEventType {
  return Object.hasOwn(STRIPE_WEBHOOK_HANDLERS, type)
}

/**
 * Events considered and deliberately left unhandled, so a future reader does
 * not have to re-derive the reasoning — and so the verification script can tell
 * "we decided against this" apart from "nobody looked".
 */
export const DELIBERATELY_UNHANDLED_STRIPE_EVENTS: Record<string, string> = {
  'checkout.session.async_payment_failed':
    'Only fires for delayed-notification payment methods (bank debits, vouchers). Checkout is card-only, so it cannot fire; revisit if a delayed method is ever enabled.',
  'checkout.session.expired':
    'An abandoned Checkout Session grants nothing, so there is no entitlement to correct.',
  'invoice.payment_action_required':
    'SCA step-up on a renewal. Stripe emails the visitor and retries on its own, and a genuine failure arrives as invoice.payment_failed, which is handled. Adding it would only duplicate the dunning signal.',
}
