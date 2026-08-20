import type Stripe from 'stripe'

/**
 * The Stripe API version every client in this repo talks.
 *
 * `current_period_end` lives on the subscription item in this version
 * (ADR-0008). An unpinned client follows whatever the installed SDK defaults
 * to after an upgrade, `getSubscriptionPeriodSeconds` starts returning nulls,
 * and every member loses access. Bumping this is a deliberate, reviewed change.
 *
 * It lives in its own module, apart from `stripe.ts`, because the batch scripts
 * need it and `stripe.ts` pulls in `APP_CONFIG` — importing that from a script
 * would drag boot-time env validation into a process that supplies its own key.
 * A leaf with a single type-only import can be shared by anything.
 *
 * Every Stripe client must pass it. `stripe-api-version.test.ts` fails the
 * build if a new `new Stripe(...)` appears without one.
 */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2025-08-27.basil'
