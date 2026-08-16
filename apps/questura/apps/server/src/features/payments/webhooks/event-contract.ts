/**
 * The contract between this app and the Stripe webhook endpoint.
 *
 * Deliberately dependency-free — no handlers, no Payload, no config. It is
 * imported both by the running app and by
 * `scripts/verify-stripe-webhook-events.ts`, which has to be runnable on the
 * deploy host where dev dependencies are not installed and importing a handler
 * would drag in the entire server.
 *
 * Drift is prevented from the other direction: `handled-events.ts` types its
 * dispatch map as `Record<HandledStripeEventType, …>`, so a name added here
 * without a handler, or a handler added without a name here, fails to compile.
 */

/** Exactly the events the live webhook endpoint must have enabled. */
export const HANDLED_STRIPE_EVENT_TYPES = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
] as const

export type HandledStripeEventType = (typeof HANDLED_STRIPE_EVENT_TYPES)[number]

const HANDLED_LOOKUP: ReadonlySet<string> = new Set(HANDLED_STRIPE_EVENT_TYPES)

export function isHandledStripeEventType(type: string): type is HandledStripeEventType {
  return HANDLED_LOOKUP.has(type)
}

/**
 * Events considered and deliberately left unhandled, so a future reader does
 * not have to re-derive the reasoning — and so the verification script can tell
 * "we decided against this" apart from "nobody looked".
 */
export const DELIBERATELY_UNHANDLED_STRIPE_EVENTS: Readonly<Record<string, string>> = {
  'checkout.session.async_payment_failed':
    'Only fires for delayed-notification payment methods (bank debits, vouchers). Checkout is card-only, so it cannot fire; revisit if a delayed method is ever enabled.',
  'checkout.session.expired':
    'An abandoned Checkout Session grants nothing, so there is no entitlement to correct.',
  'invoice.payment_action_required':
    'SCA step-up on a renewal. Stripe emails the visitor and retries on its own, and a genuine failure arrives as invoice.payment_failed, which is handled. Adding it would only duplicate the dunning signal.',
}
