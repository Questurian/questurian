import { getPayload } from 'payload'
import type Stripe from 'stripe'
import config from '@/payload.config'
import { logger } from '@/shared/utils/logger'
import { withAdvisoryLock } from '@/shared/utils/advisory-lock'
import { findVisitorProfileByStripeCustomerId } from '@/features/visitor-auth/lib/visitor-profile'
import {
  sendMembershipConfirmationEmail,
  sendSubscriptionCancelledEmail,
  sendSubscriptionReactivatedEmail,
} from '@/emails'
import { stripe } from './stripe'
import { getSubscriptionProductName } from './payment-helpers'
import { deriveSubscriptionState, type DerivedSubscriptionState } from './subscription-state'
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
export async function resyncSubscription(subscriptionId: string): Promise<ResyncResult> {
  const payload = await getPayload({ config })

  return withAdvisoryLock(payload, `stripe:subscription:${subscriptionId}`, async () => {
    const subscription = await fetchSubscription(subscriptionId)
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id

    if (!customerId) {
      logger.error('Subscription has no customer; cannot resync', { subscriptionId })
      return { profileId: null, state: null, transitions: [] }
    }

    const profile = await findVisitorProfileByStripeCustomerId(customerId)

    if (!profile) {
      logger.error('No VisitorProfile found for Stripe customer', { customerId, subscriptionId })
      return { profileId: null, state: null, transitions: [] }
    }

    const state = deriveSubscriptionState(subscription, {
      previousDunningGraceUntil: profile.dunningGraceUntil,
      nextPaymentAttempt: nextPaymentAttemptOf(subscription),
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
