import { APIError, type CollectionBeforeDeleteHook } from 'payload'

/**
 * A Visitor profile is durable product and billing identity, not an
 * independently disposable child row. Deleting it while its BetterAuth user
 * survives makes the next session recreate empty membership and Stripe state.
 *
 * Collection access blocks normal callers; this hook also blocks trusted Local
 * API code using `overrideAccess`. Profile deletion stays unsupported until a
 * coordinated account-erasure workflow handles BetterAuth, Stripe, and
 * profile data together.
 */
export const preventVisitorProfileDelete: CollectionBeforeDeleteHook = () => {
  throw new APIError(
    'Visitor profiles cannot be deleted independently.',
    400,
  )
}
