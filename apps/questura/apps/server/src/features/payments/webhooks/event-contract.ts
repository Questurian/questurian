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
  // Without it a customer deleted in the Dashboard stays linked, and checkout
  // and the portal answer 500 for that visitor forever (launch fix plan 11).
  'customer.deleted',
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

/**
 * Why a webhook endpoint's API version is wrong for this app, or null when it
 * is right.
 *
 * Stripe renders every webhook body at the *endpoint's* API version, not the
 * version the SDK is pinned to (`stripe-api-version.ts`). The two must match:
 * API 2025-03-31.basil removed `invoice` from Charge, so the same refund reads
 * differently depending on which version rendered it, and code written against
 * one shape silently does nothing with the other. An endpoint with no version
 * follows the account default, which nothing in this repo controls. Create the
 * endpoint at the pinned version (serverless launch checklist §5).
 *
 * Takes the pinned version as an argument so this module stays import-free.
 */
export function webhookApiVersionProblem(endpointVersion: string | null, pinnedVersion: string): string | null {
  if (endpointVersion === pinnedVersion) return null

  if (!endpointVersion) {
    return `renders events at the account default API version, not the pinned ${pinnedVersion}; recreate the endpoint with api_version ${pinnedVersion}`
  }

  return `renders events at API version ${endpointVersion}, but the app is pinned to ${pinnedVersion}; recreate the endpoint with api_version ${pinnedVersion}`
}
