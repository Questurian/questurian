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
import type { HandledStripeEventType } from './event-contract'

export {
  DELIBERATELY_UNHANDLED_STRIPE_EVENTS,
  HANDLED_STRIPE_EVENT_TYPES,
  isHandledStripeEventType,
} from './event-contract'
export type { HandledStripeEventType } from './event-contract'

/**
 * The handler for each event named in the contract.
 *
 * Why a map and not a `switch`
 * ----------------------------
 * A handler only ever runs if Stripe is configured to *send* its event, and
 * nothing in the code can see that configuration. `charge.refunded` and
 * `charge.dispute.*` were handled here for months while the live endpoint had
 * never had them enabled — so every refund and every chargeback silently kept
 * the visitor's access, and no test could have caught it because the code was
 * correct. The gap was in the Dashboard.
 *
 * The `Record<HandledStripeEventType, …>` annotation is what keeps the two
 * halves honest: an event named in `event-contract.ts` with no handler here, or
 * a handler here for an event not named there, fails to compile. That lets the
 * verification script import the names alone — without dragging in Payload and
 * every handler — while still describing exactly what this dispatch does.
 */
export const STRIPE_WEBHOOK_HANDLERS: Record<
  HandledStripeEventType,
  (event: Stripe.Event) => Promise<unknown>
> = {
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
}
