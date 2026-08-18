import type Stripe from 'stripe'

import { stripe } from './stripe'

/**
 * How many same-email customers to inspect when hunting for the one this
 * visitor owns. Stripe returns newest first; a handful is enough to survive
 * accidental duplicates without paging the whole account.
 */
const CUSTOMER_SEARCH_LIMIT = 10

export type ResolvedStripeCustomer = {
  customerId: string
  /** True when no owned customer existed and a fresh one was created. */
  created: boolean
}

/**
 * Email alone never proves ownership.
 *
 * A Stripe customer's email is written once, at creation, and nothing syncs it
 * afterwards — so a visitor who changes their account address leaves their old
 * address sitting on their customer, free for the next signup to claim. This
 * account also predates the site and holds customers created by hand. Matching
 * on email alone would hand a stranger's card, invoices and portal to whoever
 * registers that address next, and — because two profiles may then carry the
 * same `stripeCustomerId` — would let their subscription webhooks land on the
 * wrong profile.
 *
 * `metadata.visitorAuthUserId` is stamped by us at creation and is the only
 * claim of ownership we trust. A legacy customer without it is treated as
 * someone else's: the visitor gets a new customer, and the old one can be
 * merged by hand in the Dashboard if it really was theirs.
 */
function isOwnedBy(customer: Stripe.Customer, visitorAuthUserId: string): boolean {
  return customer.metadata?.visitorAuthUserId === visitorAuthUserId
}

/**
 * Push a visitor's current address onto their Stripe customer.
 *
 * Stripe writes a customer's email once and never hears about a change, so
 * without this every address change leaves the old one stranded on the customer
 * — the drift `isOwnedBy` exists to survive. Keeping the two in step also keeps
 * Stripe's receipts and dunning mail going somewhere the visitor still reads.
 *
 * Best-effort by design: this runs inside email verification, and a Stripe
 * outage must not cost someone their verified address.
 */
export async function syncStripeCustomerEmail(
  stripeCustomerId: string | null | undefined,
  email: string | null | undefined
): Promise<boolean> {
  if (!stripeCustomerId || !email) return false

  try {
    await stripe.customers.update(stripeCustomerId, { email })
    return true
  } catch (error) {
    console.error('Failed to sync visitor email to Stripe customer', {
      stripeCustomerId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Find the Stripe customer this visitor owns, or create one.
 *
 * Callers must persist the returned id on the visitor profile; the lookup here
 * is a recovery path for a lost linkage, not a substitute for storing it.
 */
export async function resolveStripeCustomerForVisitor(params: {
  email: string
  visitorAuthUserId: string
  visitorProfileId?: string | number | null
  name?: string | null
}): Promise<ResolvedStripeCustomer> {
  const { email, visitorAuthUserId, visitorProfileId, name } = params

  // The profile carries no Stripe linkage, but that does not mean this human is
  // new to Stripe. A `visitor-profiles` row can be hard-deleted by an admin, or
  // lost, while the Better Auth user lives on; the next `/api/me` silently
  // recreates a blank profile without `stripeCustomerId`. Creating
  // unconditionally would then bill the same person through a second Stripe
  // customer, splitting their billing history and leaving the original
  // subscription orphaned. Adopt their own customer first — theirs only.
  const existing = await stripe.customers.list({ email, limit: CUSTOMER_SEARCH_LIMIT })
  const owned = (existing.data ?? []).find((customer) => isOwnedBy(customer, visitorAuthUserId))

  if (owned) {
    return { customerId: owned.id, created: false }
  }

  const customer = await stripe.customers.create({
    email,
    name: name || email,
    metadata: {
      visitorAuthUserId,
      visitorProfileId: String(visitorProfileId ?? ''),
    },
  })

  return { customerId: customer.id, created: true }
}

const LIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
])

/**
 * Statuses that will bill, including `incomplete` from a Checkout that has
 * not finished confirming. Creation-time checkout still ignores incomplete
 * so a visitor can retry after abandoned 3DS; completion-time duplicate
 * detection must count it or two parallel Checkouts both land.
 */
const BILLABLE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  ...LIVE_SUBSCRIPTION_STATUSES,
  'incomplete',
])

/**
 * How much a status is worth when only one subscription may survive. Lower
 * wins. Collected money outranks money Stripe is still chasing, which outranks
 * a Checkout that never confirmed at all.
 */
const KEEP_PRIORITY_BY_STATUS: Partial<Record<Stripe.Subscription.Status, number>> = {
  active: 0,
  trialing: 0,
  past_due: 1,
  unpaid: 1,
  incomplete: 2,
}

const LOWEST_KEEP_PRIORITY = 3

/**
 * Pick the one subscription a customer keeps when several are billable.
 *
 * Age alone is the wrong tiebreak. A visitor who abandons 3DS leaves an
 * `incomplete` subscription sitting on the customer for ~23 hours, so their
 * successful retry that same day is always the *newer* of the two. Keeping the
 * older one there cancels and refunds the subscription that actually paid, then
 * derives entitlement from one that never collected — the visitor pays, is
 * refunded, and gets nothing.
 *
 * Paid-ness is therefore ranked first. Equal-priority ties keep the newer
 * subscription: two Checkouts that both collected (monthly then yearly) should
 * keep the later choice, not refund the one the buyer just paid for.
 */
export function selectSubscriptionToKeep(
  billable: Stripe.Subscription[]
): Stripe.Subscription | null {
  return billable.reduce<Stripe.Subscription | null>((best, subscription) => {
    if (!best) return subscription

    const candidate = KEEP_PRIORITY_BY_STATUS[subscription.status] ?? LOWEST_KEEP_PRIORITY
    const incumbent = KEEP_PRIORITY_BY_STATUS[best.status] ?? LOWEST_KEEP_PRIORITY

    if (candidate !== incumbent) return candidate < incumbent ? subscription : best

    return subscription.created > best.created ? subscription : best
  }, null)
}

async function listCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
  const listed = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  })

  return listed.data
}

/**
 * A subscription Stripe is still collecting on, or retrying.
 *
 * Local `subscriptionStatus === 'active'` was the old checkout gate. That let a
 * `past_due` visitor open a second Checkout session on the same customer, so
 * Stripe billed them twice and the last webhook won. Incomplete / canceled
 * are left out: those visitors need to be able to pay again.
 */
export function isLiveSubscription(subscription: Stripe.Subscription): boolean {
  return LIVE_SUBSCRIPTION_STATUSES.has(subscription.status)
}

export async function findLiveSubscription(
  customerId: string
): Promise<Stripe.Subscription | null> {
  const listed = await listCustomerSubscriptions(customerId)

  return listed.find(isLiveSubscription) ?? null
}

/**
 * The one subscription a profile row should mirror, given everything Stripe
 * holds for the customer.
 *
 * This is the same ownership rule `ownsProfileRow` enforces on the webhook path
 * (`subscription-resync.ts`): the subscription that is billing owns the row,
 * and only when none is does the newest one own it. Newest-wins on its own is
 * the bug PR #324 fixed — a visitor who abandons 3DS leaves an `incomplete`
 * subscription sitting on the customer for ~23 hours, so a dead attempt is the
 * newest thing there while a paid membership is still running. Mirroring the
 * attempt stamps `past_due` and its period start over the live membership's
 * remaining paid time, and points `/account`'s cancel button at a dead id.
 *
 * Ties among live subscriptions keep the newest, matching the order Stripe
 * lists them in, so the batch path and the webhook path cannot disagree.
 */
export function selectProfileSubscription(
  subscriptions: Stripe.Subscription[]
): Stripe.Subscription | null {
  const live = subscriptions.filter(isLiveSubscription)
  const candidates = live.length > 0 ? live : subscriptions

  return candidates.reduce<Stripe.Subscription | null>(
    (best, subscription) => (!best || subscription.created > best.created ? subscription : best),
    null
  )
}

export async function listBillableSubscriptions(
  customerId: string
): Promise<Stripe.Subscription[]> {
  const listed = await listCustomerSubscriptions(customerId)

  return listed.filter((subscription) => BILLABLE_SUBSCRIPTION_STATUSES.has(subscription.status))
}
