import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/payments/lib/stripe'
import { updateUserSubscription, mapStripeStatusToInternal, getStripeSubscriptionDetails } from '@/payments/lib/payment-service'
import { convertStripeTimestamp, getSubscriptionProductName } from '@/payments/lib/payment-helpers'
import { sendMembershipConfirmationEmail, sendSubscriptionCancelledEmail } from '@/emails'
import { getPayload } from 'payload'
import config from '@/payload.config'
import Stripe from 'stripe'
import type { StripeSubscriptionExpanded, UserSubscriptionUpdate } from '@/payments/types'
import { APP_CONFIG } from '@/shared/config'
import { findVisitorProfileByStripeCustomerId, splitDisplayName } from '@/features/visitor-auth/lib/visitor-profile'
import { logger } from '@/shared/utils/logger'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) {
    logger.warn('Stripe webhook rejected: missing stripe-signature header')
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      APP_CONFIG.stripe.webhookSecret
    )
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  logger.info('Stripe webhook received', { eventId: event.id, eventType: event.type })

  const payload = await getPayload({ config })

  // Idempotency guard: Stripe retries deliveries, so the same event can arrive
  // more than once. Skip events we've already processed.
  const alreadyProcessed = await payload.find({
    collection: 'stripe-webhook-events',
    where: { eventId: { equals: event.id } },
    limit: 1,
  })

  if (alreadyProcessed.totalDocs > 0) {
    logger.info('Duplicate Stripe event delivery skipped', { eventId: event.id })
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Ordering guard: Stripe does not guarantee delivery order. If we've already
  // processed a newer event for this subscription (e.g. subscription.deleted),
  // don't let this older event overwrite that state.
  const subscriptionId = getSubscriptionIdFromEvent(event)

  if (subscriptionId) {
    const newerEvent = await payload.find({
      collection: 'stripe-webhook-events',
      where: {
        and: [
          { subscriptionId: { equals: subscriptionId } },
          { eventCreated: { greater_than: event.created } },
        ],
      },
      limit: 1,
    })

    if (newerEvent.totalDocs > 0) {
      logger.info('Stale Stripe event skipped: newer event already processed', {
        eventId: event.id,
        subscriptionId,
      })
      // Record it so retries of this stale event are also skipped
      await recordProcessedEvent(payload, event, subscriptionId)
      return NextResponse.json({ received: true, stale: true })
    }
  }

  try {
    // Handle Stripe subscription events
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      default:
        logger.info('Unhandled Stripe event type', { eventId: event.id, eventType: event.type })
    }

    // Only record after successful processing so failed events are retried by Stripe
    await recordProcessedEvent(payload, event, subscriptionId)

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error('Error processing Stripe webhook', {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

/**
 * Resolve the subscription's current period end as an ISO string, preferring
 * the timestamp on the webhook payload and falling back to the Stripe API
 * when the payload doesn't carry a usable value.
 */
async function resolveRenewalDate(subscription: Stripe.Subscription): Promise<string | null> {
  const expandedSubscription = subscription as StripeSubscriptionExpanded

  if (expandedSubscription.current_period_end) {
    const convertedDate = convertStripeTimestamp(expandedSubscription.current_period_end)
    if (convertedDate) {
      return convertedDate.toISOString()
    }
  }

  try {
    const subscriptionDetails = await getStripeSubscriptionDetails(subscription.id)
    if (subscriptionDetails?.currentPeriodEnd) {
      return subscriptionDetails.currentPeriodEnd.toISOString()
    }
  } catch (error) {
    logger.error('Error fetching subscription details from Stripe', {
      subscriptionId: subscription.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return null
}

/**
 * Extract the subscription ID from subscription lifecycle events.
 * Used for the ordering guard — only these events carry full subscription
 * state that a stale delivery could overwrite.
 */
function getSubscriptionIdFromEvent(event: Stripe.Event): string | null {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return (event.data.object as Stripe.Subscription).id
    default:
      return null
  }
}

/**
 * Persist a processed event ID so duplicate deliveries can be skipped.
 * A concurrent duplicate delivery can hit the unique constraint on eventId —
 * that just means the other delivery won, so the error is safe to swallow.
 */
async function recordProcessedEvent(
  payload: Awaited<ReturnType<typeof getPayload>>,
  event: Stripe.Event,
  subscriptionId: string | null
) {
  try {
    await payload.create({
      collection: 'stripe-webhook-events',
      data: {
        eventId: event.id,
        eventType: event.type,
        eventCreated: event.created,
        subscriptionId,
      },
    })
  } catch (error) {
    logger.warn('Could not record processed Stripe event', {
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Handle successful checkout completion
 * This is triggered when a user completes their subscription checkout
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  logger.info('Processing checkout.session.completed', { sessionId: session.id })

  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  if (!customerId || !subscriptionId) {
    logger.error('Missing customer or subscription ID in checkout session', {
      sessionId: session.id,
    })
    return
  }

  // Get subscription details to capture renewal date
  const subscriptionDetails = await getStripeSubscriptionDetails(subscriptionId)
  const subscriptionRenewsAt = subscriptionDetails?.currentPeriodEnd?.toISOString() || null

  if (!subscriptionRenewsAt) {
    logger.warn('Could not determine renewal date for subscription', { subscriptionId })
  }

  // Extract affiliate referral ID from metadata if present (and feature enabled)
  const updateData: UserSubscriptionUpdate = {
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: 'active',
    subscriptionRenewsAt
  }

  if (APP_CONFIG.features.endorselyAffiliates) {
    const referralId = session.metadata?.endorsely_referral
    if (referralId) {
      logger.info('Subscription created via affiliate referral', { referralId, subscriptionId })
      // Store affiliate referral info
      updateData.affiliateReferralId = referralId
      updateData.affiliateReferredAt = new Date().toISOString()
    }
  }

  // Capture the billing name Stripe collected at checkout, but only if the
  // visitor profile doesn't already have a name (don't clobber a name the user
  // set themselves in settings/account).
  const billingName = session.customer_details?.name?.trim()
  if (billingName) {
    const profile = await findVisitorProfileByStripeCustomerId(customerId)
    if (profile && !profile.firstName && !profile.lastName) {
      const { firstName, lastName } = splitDisplayName(billingName)
      updateData.firstName = firstName
      updateData.lastName = lastName
    }
  }

  // Update user with subscription info
  const success = await updateUserSubscription(customerId, updateData)

  if (success) {
    logger.info('Visitor subscription activated via checkout completion', { subscriptionId })

    // Send membership confirmation email for new subscription
    await sendMembershipConfirmationAfterPayment(customerId, subscriptionId, true)
  } else {
    logger.error('Failed to update visitor subscription from checkout', { subscriptionId })
  }
}

/**
 * Handle subscription creation
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  logger.info('Processing customer.subscription.created', { subscriptionId: subscription.id })

  const customerId = subscription.customer as string

  const status = mapStripeStatusToInternal(subscription.status)

  // Get renewal date for active subscriptions
  const subscriptionRenewsAt = status === 'active' ? await resolveRenewalDate(subscription) : null

  await updateUserSubscription(customerId, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: status,
    subscriptionRenewsAt
  })

  logger.info('User subscription created', { subscriptionId: subscription.id, status })

  // Send membership confirmation email for active subscriptions
  if (status === 'active') {
    await sendMembershipConfirmationAfterPayment(customerId, subscription.id, true)
  }
}

/**
 * Handle subscription status updates
 * This covers status changes like active -> past_due -> cancelled
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  logger.info('Processing customer.subscription.updated', {
    subscriptionId: subscription.id,
    status: subscription.status,
  })
  const expandedSubscription = subscription as StripeSubscriptionExpanded

  const customerId = subscription.customer as string

  // GUARD: Skip webhook for staff members
  const status = mapStripeStatusToInternal(subscription.status)
  const cancelAtPeriodEnd = expandedSubscription.cancel_at_period_end || false

  // Get renewal date for active subscriptions, clear for inactive ones
  const subscriptionRenewsAt = status === 'active' ? await resolveRenewalDate(subscription) : null

  // Set membershipExpiration when subscription is cancelled but still active
  // (the paid period runs to the same current-period-end a renewal would use).
  // Stays null when the subscription is renewing, which clears any previous value.
  let membershipExpiration: string | null = null
  if (cancelAtPeriodEnd && status === 'active') {
    membershipExpiration = subscriptionRenewsAt
    if (membershipExpiration) {
      logger.info('Subscription cancelled but active until period end', {
        subscriptionId: subscription.id,
        membershipExpiration,
      })
    }
  }

  await updateUserSubscription(customerId, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: status,
    subscriptionRenewsAt,
    cancelAtPeriodEnd,
    membershipExpiration
  })

  logger.info('User subscription updated', {
    subscriptionId: subscription.id,
    status,
    cancelAtPeriodEnd,
  })
}

/**
 * Handle subscription deletion/cancellation
 * Honor the paid period by setting membershipExpiration to current_period_end
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  logger.info('Processing customer.subscription.deleted', { subscriptionId: subscription.id })

  const customerId = subscription.customer as string

  const expandedSubscription = subscription as StripeSubscriptionExpanded

  // Calculate when the paid period actually ends
  const currentPeriodEnd = convertStripeTimestamp(expandedSubscription.current_period_end)
  const now = new Date()

  // If the subscription period hasn't ended yet, honor the paid time
  let membershipExpiration: string | null = null
  if (currentPeriodEnd && currentPeriodEnd > now) {
    membershipExpiration = currentPeriodEnd.toISOString()
    logger.info('Honoring paid period after cancellation', {
      subscriptionId: subscription.id,
      membershipExpiration,
    })
  } else if (!currentPeriodEnd) {
    logger.warn('Could not convert subscription period end date, treating as immediate revocation', {
      subscriptionId: subscription.id,
    })
  }

  await updateUserSubscription(customerId, {
    subscriptionStatus: 'cancelled',
    membershipExpiration,
    subscriptionRenewsAt: null, // Clear renewal date for cancelled subscriptions
    cancelAtPeriodEnd: false // Clear cancel flag since subscription is now fully deleted
  })

  logger.info('User subscription cancelled', { subscriptionId: subscription.id })

  // Send cancellation email - this is typically triggered by Stripe when the subscription period actually ends
  const wasImmediate = !membershipExpiration // If no expiration, access was revoked immediately
  await sendSubscriptionCancellationEmail(customerId, subscription.id, membershipExpiration ? new Date(membershipExpiration) : null, wasImmediate)
}

/**
 * Handle successful invoice payments
 * This is triggered for recurring subscription payments and serves as payment confirmation
 * Also updates the renewal date for subscription renewals
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  logger.info('Processing invoice.payment_succeeded', { invoiceId: invoice.id })

  const customerId = invoice.customer as string

  // Check if this invoice is related to a subscription
  let subscriptionId: string | null = null

  if ((invoice as any).subscription) {
    subscriptionId = (invoice as any).subscription as string
  } else if ((invoice as any).subscription_id) {
    subscriptionId = (invoice as any).subscription_id as string
  } else {
    // Webhook event may not have subscription field populated
    // Fetch full invoice from Stripe API to get subscription ID
    try {
      if (!invoice.id) {
        throw new Error('Invoice ID is missing')
      }
      const stripeInvoice = await stripe.invoices.retrieve(invoice.id)
      const invoiceData = stripeInvoice as any
      if (invoiceData.subscription) {
        subscriptionId = invoiceData.subscription as string
      }
    } catch (error) {
      logger.error('Error fetching invoice from Stripe API', {
        invoiceId: invoice.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!subscriptionId) {
    logger.info('Invoice not related to subscription, skipping', { invoiceId: invoice.id })
    return
  }

  const billingReason = (invoice as any).billing_reason

  logger.info('Payment successful for subscription', { subscriptionId, billingReason })

  // For renewal payments, update the subscription renewal date
  if (billingReason === 'subscription_cycle') {
    try {
      const subscriptionDetails = await getStripeSubscriptionDetails(subscriptionId)
      if (subscriptionDetails?.currentPeriodEnd) {
        const updatedRenewalDate = subscriptionDetails.currentPeriodEnd.toISOString()

        await updateUserSubscription(customerId, {
          subscriptionRenewsAt: updatedRenewalDate
        })

        logger.info('Renewal date updated after renewal payment', {
          subscriptionId,
          subscriptionRenewsAt: updatedRenewalDate,
        })
      }
    } catch (error) {
      logger.error('Failed to update renewal date on subscription renewal', {
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't fail the webhook if renewal date update fails - the subscription is still active
    }
  }

  // Send membership confirmation email only for new subscriptions
  // Regular renewals are handled silently (renewal date already updated above)
  if (billingReason === 'subscription_create') {
    await sendMembershipConfirmationAfterPayment(customerId, subscriptionId, true)
  }
}

/**
 * Handle failed invoice payments
 * This can lead to past_due status
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  logger.info('Processing invoice.payment_failed', { invoiceId: invoice.id })

  if (!(invoice as any).subscription) {
    logger.info('Invoice not related to subscription, skipping', { invoiceId: invoice.id })
    return
  }

  const customerId = invoice.customer as string

  // Mark as past due, but don't immediately revoke membership
  // Stripe will handle the subscription status updates
  await updateUserSubscription(customerId, {
    subscriptionStatus: 'past_due'
  })

  logger.warn('User subscription marked as past due after payment failure', {
    invoiceId: invoice.id,
  })
}

/**
 * Send membership confirmation email after successful payment
 */
async function sendMembershipConfirmationAfterPayment(
  customerId: string,
  subscriptionId: string,
  isRecurring: boolean = true
) {
  try {
    const payload = await getPayload({ config })

    const profile = await findVisitorProfileByStripeCustomerId(customerId)
    if (!profile) {
      logger.error('No VisitorProfile found for membership confirmation email', { subscriptionId })
      return
    }

    // Get subscription details for the email
    const subscriptionDetails = await getStripeSubscriptionDetails(subscriptionId)
    if (!subscriptionDetails) {
      logger.error('Could not retrieve subscription details for email', { subscriptionId })
      return
    }

    // Get Stripe product information for subscription type
    const subscriptionType = await getSubscriptionProductName(subscriptionId)

    // Send the membership confirmation email
    await sendMembershipConfirmationEmail(payload, {
      email: profile.email,
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      subscriptionType,
      membershipExpiresAt: subscriptionDetails.currentPeriodEnd || undefined,
      isRecurring
    })

    logger.info('Membership confirmation email sent', { profileId: profile.id, subscriptionId })
  } catch (error) {
    logger.error('Failed to send membership confirmation email', {
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Send subscription cancellation email after cancellation
 */
async function sendSubscriptionCancellationEmail(
  customerId: string,
  subscriptionId: string,
  membershipExpiresAt: Date | null,
  wasImmediate: boolean = false
) {
  try {
    const payload = await getPayload({ config })

    const profile = await findVisitorProfileByStripeCustomerId(customerId)
    if (!profile) {
      logger.error('No VisitorProfile found for cancellation email', { subscriptionId })
      return
    }

    // Get Stripe product information for subscription type
    const subscriptionType = await getSubscriptionProductName(subscriptionId)

    // Send the cancellation email
    await sendSubscriptionCancelledEmail(payload, {
      email: profile.email,
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      subscriptionType,
      membershipExpiresAt: membershipExpiresAt || undefined,
      wasImmediate
    })

    logger.info('Subscription cancellation email sent', { profileId: profile.id, subscriptionId })
  } catch (error) {
    logger.error('Failed to send subscription cancellation email', {
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
