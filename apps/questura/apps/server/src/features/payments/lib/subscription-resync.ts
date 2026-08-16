import { getPayload } from 'payload'
import type Stripe from 'stripe'
import config from '@/payload.config'
import { logger } from '@/shared/utils/logger'
import { withAdvisoryLock } from '@/shared/utils/advisory-lock'
import { resolveProfileForStripeCustomer } from './subscription-profile'
import {
  sendMembershipConfirmationEmail,
  sendSubscriptionCancelledEmail,
  sendSubscriptionReactivatedEmail,
} from '@/emails'
import { stripe } from './stripe'
import { findLiveSubscription, isLiveSubscription } from './customer-linkage'
import { getSubscriptionProductName } from './payment-helpers'
import {
  deriveSubscriptionState,
  type AccessRevocation,
  type DerivedSubscriptionState,
} from './subscription-state'
import { resolveMembershipTransitions, type MembershipTransition } from './membership-transitions'

/**
 * The single writer of subscription state on a Visitor profile (ADR-0008).
 *
 * Webhooks are treated as triggers, never as data: the delivered payload is
 * rendered at whatever API version the endpoint is pinned to, which on this
 * account is five years behind the SDK. Refetching gives one known shape, and
 * means a stale delivery writes current truth rather than truth as of
 * emission.
 */

type ResyncResult = {
  profileId: string | number | null
  state: DerivedSubscriptionState | null
  transitions: MembershipTransition[]
}

export type ResyncOptions = {
  /**
   * Revocation to trust over the subscription's own metadata, for callers that
   * know the metadata write was refused (a cancelled subscription). `null`
   * asserts "not revoked"; omit the key entirely to read Stripe as usual.
   */
  accessRevoked?: AccessRevocation | null
}

/** `next_payment_attempt` lives on the invoice, so the grace needs it expanded. */
async function fetchSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  }) as unknown as Promise<Stripe.Subscription>
}

function nextPaymentAttemptOf(subscription: Stripe.Subscription): number | null {
  const invoice = subscription.latest_invoice

  if (!invoice || typeof invoice === 'string') return null

  return (invoice as Stripe.Invoice).next_payment_attempt ?? null
}

/**
 * Retrieve the subscription the profile currently points at, tolerating an id
 * Stripe no longer knows. A cancelled subscription is still retrievable, so a
 * `resource_missing` means the stored id is stale beyond repair (wrong account,
 * hand-edited row) and must not be allowed to freeze the profile forever. Any
 * other Stripe failure is transient and propagates, so the webhook retries
 * rather than deciding ownership on missing information.
 */
async function fetchIncumbent(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId)
  } catch (error) {
    if ((error as { code?: string }).code === 'resource_missing') {
      logger.warn('Profile points at a subscription Stripe no longer has', { subscriptionId })
      return null
    }
    throw error
  }
}

/**
 * Whether this subscription is the one whose state the profile should mirror.
 *
 * A profile holds one subscription, but a customer accumulates many, and every
 * one of them keeps emitting events for years: a goodwill refund on a
 * subscription cancelled last spring raises `charge.refunded` today, and the
 * duplicate-checkout collapse deliberately refunds and cancels the extras it
 * just made. Writing each of those onto the profile unconditionally stamps a
 * dead subscription over a live membership — the visitor loses access while
 * Stripe keeps billing them, and `/account` then points its cancel button at
 * the dead one, so they cannot even stop the charge.
 *
 * `charge.refunded` and `charge.dispute.*` carry no subscription id, so the
 * webhook ordering guard cannot see this collision; ownership has to be decided
 * here, against Stripe rather than against the delivery.
 *
 * The subscription that is billing owns the row. When none is, the newest one
 * does, so an old cancellation cannot overwrite a newer one's final state.
 *
 * Asked even when the profile already names this subscription. "The row points
 * at me" is not the same claim as "I am still the one billing": the collapse
 * refunds and cancels an extra that the profile may already have been moved
 * onto by that subscription's own `customer.subscription.created`, and the
 * `charge.refunded` that follows then revokes a membership the survivor is
 * paying for. Skipping the check on a name match made that case the one place
 * a live subscription was never consulted.
 */
async function ownsProfileRow(
  customerId: string,
  subscription: Stripe.Subscription,
  incumbentId: string
): Promise<boolean> {
  if (isLiveSubscription(subscription)) return true

  const live = await findLiveSubscription(customerId)
  if (live && live.id !== subscription.id) return false

  const incumbent = await fetchIncumbent(incumbentId)
  if (!incumbent) return true

  return subscription.created >= incumbent.created
}

async function sendTransitionEmails(
  payload: Awaited<ReturnType<typeof getPayload>>,
  profile: { email: string; firstName?: string | null; lastName?: string | null },
  subscriptionId: string,
  transitions: MembershipTransition[]
) {
  if (transitions.length === 0) return

  const subscriptionType = await getSubscriptionProductName(subscriptionId)
  const recipient = {
    email: profile.email,
    firstName: profile.firstName ?? undefined,
    lastName: profile.lastName ?? undefined,
    subscriptionType,
  }

  for (const transition of transitions) {
    try {
      switch (transition.kind) {
        case 'membership_started':
          await sendMembershipConfirmationEmail(payload, { ...recipient, isRecurring: true })
          break
        case 'cancellation_scheduled':
          await sendSubscriptionCancelledEmail(payload, {
            ...recipient,
            membershipExpiresAt: transition.endsAt ? new Date(transition.endsAt) : undefined,
            wasImmediate: false,
          })
          break
        case 'reactivated':
          await sendSubscriptionReactivatedEmail(payload, {
            ...recipient,
            renewsAt: transition.renewsAt ? new Date(transition.renewsAt) : new Date(),
          })
          break
        case 'membership_ended':
          await sendSubscriptionCancelledEmail(payload, {
            ...recipient,
            wasImmediate: transition.wasImmediate,
          })
          break
      }
    } catch (error) {
      // A failed email must not fail the state write; the profile is the record
      // that gates access, the email is a courtesy.
      logger.error('Failed to send membership transition email', {
        subscriptionId,
        transition: transition.kind,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/**
 * Refetch a subscription from Stripe and write everything it implies onto the
 * matching Visitor profile, emitting emails for whatever actually changed.
 *
 * Serialised per subscription: the read, the Stripe call and the write are not
 * atomic, so without the lock two parallel deliveries would each observe the
 * same before-state and each decide the same transition occurred.
 */
export async function resyncSubscription(
  subscriptionId: string,
  options: ResyncOptions = {}
): Promise<ResyncResult> {
  const payload = await getPayload({ config })

  return withAdvisoryLock(payload, `stripe:subscription:${subscriptionId}`, async () => {
    const subscription = await fetchSubscription(subscriptionId)
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id

    if (!customerId) {
      throw new Error(`Subscription ${subscriptionId} has no customer; cannot resync`)
    }

    // Checkout copies its metadata onto the subscription, so even a renewal
    // years later still carries the visitor it belongs to. That is what makes a
    // lost customer linkage recoverable instead of terminal.
    const profile = await resolveProfileForStripeCustomer(
      customerId,
      subscription.metadata?.visitorAuthUserId ?? null
    )

    if (!profile) {
      throw new Error(
        `No VisitorProfile found for Stripe customer ${customerId} on subscription ${subscriptionId}`
      )
    }

    const incumbentId = profile.stripeSubscriptionId

    if (incumbentId) {
      const owns = await ownsProfileRow(customerId, subscription, incumbentId)

      if (!owns) {
        logger.warn('Ignoring resync of a subscription the profile has moved on from', {
          subscriptionId,
          incumbentSubscriptionId: incumbentId,
          profileId: profile.id,
          status: subscription.status,
        })

        return { profileId: profile.id, state: null, transitions: [] }
      }
    }

    const state = deriveSubscriptionState(subscription, {
      previousDunningGraceUntil: profile.dunningGraceUntil,
      nextPaymentAttempt: nextPaymentAttemptOf(subscription),
      // Spread so an absent option stays absent: `accessRevoked: undefined`
      // and `accessRevoked: null` mean different things to the deriver.
      ...('accessRevoked' in options ? { accessRevoked: options.accessRevoked } : {}),
    })

    const transitions = resolveMembershipTransitions(profile, state)

    await payload.update({
      collection: 'visitor-profiles',
      id: profile.id,
      data: {
        stripeSubscriptionId: subscription.id,
        ...state,
      },
    })

    logger.info('Resynced subscription from Stripe', {
      subscriptionId,
      profileId: profile.id,
      status: state.subscriptionStatus,
      paidThroughAt: state.paidThroughAt,
      transitions: transitions.map((transition) => transition.kind),
    })

    await sendTransitionEmails(payload, profile, subscription.id, transitions)

    return { profileId: profile.id, state, transitions }
  })
}
