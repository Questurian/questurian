import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/payments/lib/stripe'
import { updateUserSubscription, mapStripeStatusToInternal, getStripeSubscriptionDetails } from '@/payments/lib/payment-service'
import { convertStripeTimestamp, getSubscriptionProductName } from '@/payments/lib/payment-helpers'
import { sendMembershipConfirmationEmail, sendSubscriptionCancelledEmail } from '@/emails'
import { getPayload } from 'payload'
import config from '@/payload.config'
import Stripe from 'stripe'
import type { StripeSubscriptionExpanded } from '@/payments/types'
import { APP_CONFIG } from '@/shared/config'
import { findVisitorProfileByStripeCustomerId } from '@/features/visitor-auth/lib/visitor-profile'

export async function POST(req: NextRequest) {
  console.log('🔔 Stripe webhook received!')
  console.log('🔐 STRIPE_WEBHOOK_SECRET exists:', !!APP_CONFIG.stripe.webhookSecret)

  const body = await req.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  console.log('📝 Webhook body length:', body.length)
  console.log('🔑 Signature present:', !!sig)

  if (!sig) {
    console.error('❌ No stripe-signature header found')
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      APP_CONFIG.stripe.webhookSecret
    )
    console.log('✅ Webhook signature verified successfully')
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log('📨 Received Stripe event:', event.type)
  console.log('💳 Event ID:', event.id)

  const payload = await getPayload({ config })

  // Idempotency guard: Stripe retries deliveries, so the same event can arrive
  // more than once. Skip events we've already processed.
  const alreadyProcessed = await payload.find({
    collection: 'stripe-webhook-events',
    where: { eventId: { equals: event.id } },
    limit: 1,
  })

  if (alreadyProcessed.totalDocs > 0) {
    console.log('🔁 Duplicate delivery of event', event.id, '- skipping')
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
      console.log('⏭️ Stale event', event.id, '- a newer event for subscription', subscriptionId, 'was already processed, skipping')
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
        console.log(`⚠️ Unhandled event type: ${event.type}`)
        console.log('Event data:', JSON.stringify(event.data.object, null, 2))
    }

    // Only record after successful processing so failed events are retried by Stripe
    await recordProcessedEvent(payload, event, subscriptionId)

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
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
    console.warn('⚠️ Could not record processed event', event.id, error)
  }
}

/**
 * Handle successful checkout completion
 * This is triggered when a user completes their subscription checkout
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('🛒 Processing checkout.session.completed for session:', session.id)

  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  if (!customerId || !subscriptionId) {
    console.error('Missing customer or subscription ID in checkout session')
    return
  }

  // Get subscription details to capture renewal date
  const subscriptionDetails = await getStripeSubscriptionDetails(subscriptionId)
  const subscriptionRenewsAt = subscriptionDetails?.currentPeriodEnd?.toISOString() || null

  if (subscriptionRenewsAt) {
    console.log('✅ Got renewal date from Stripe API:', subscriptionRenewsAt)
  } else {
    console.warn('⚠️ Could not determine renewal date for subscription', subscriptionId)
  }

  // Extract affiliate referral ID from metadata if present (and feature enabled)
  const updateData: any = {
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: 'active',
    subscriptionRenewsAt
  }

  if (APP_CONFIG.features.endorselyAffiliates) {
    const referralId = session.metadata?.endorsely_referral
    if (referralId) {
      console.log(`[Affiliate] Subscription created via referral ${referralId}`)
      // Store affiliate referral info
      updateData.affiliateReferralId = referralId
      updateData.affiliateReferredAt = new Date()
    }
  }

  // Capture the billing name Stripe collected at checkout, but only if the
  // visitor profile doesn't already have a name (don't clobber a name the user
  // set themselves in settings/account).
  const billingName = session.customer_details?.name?.trim()
  if (billingName) {
    const profile = await findVisitorProfileByStripeCustomerId(customerId)
    if (profile && !profile.firstName && !profile.lastName) {
      const parts = billingName.split(/\s+/).filter(Boolean)
      updateData.firstName = parts[0] ?? ''
      updateData.lastName = parts.slice(1).join(' ')
    }
  }

  // Update user with subscription info
  const success = await updateUserSubscription(customerId, updateData)

  if (success) {
    console.log('✅ Visitor subscription activated via checkout completion')

    // Send membership confirmation email for new subscription
    await sendMembershipConfirmationAfterPayment(customerId, subscriptionId, true)
  } else {
    console.error('❌ Failed to update visitor subscription from checkout')
  }
}

/**
 * Handle subscription creation
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('🔄 Processing customer.subscription.created for subscription:', subscription.id)
  const sub = subscription as any
  console.log('📦 Raw subscription webhook data:', {
    current_period_end: sub.current_period_end,
    current_period_start: sub.current_period_start,
    type_of_current_period_end: typeof sub.current_period_end
  })

  const customerId = subscription.customer as string

  const status = mapStripeStatusToInternal(subscription.status)
  const expandedSubscription = subscription as StripeSubscriptionExpanded

  // Get renewal date for active subscriptions
  let subscriptionRenewsAt: string | null = null
  if (status === 'active') {
    // Try to get renewal date from webhook event data first
    if (expandedSubscription.current_period_end) {
      try {
        const convertedDate = convertStripeTimestamp(expandedSubscription.current_period_end)
        if (convertedDate) {
          subscriptionRenewsAt = convertedDate.toISOString()
          console.log('📅 Got renewal date from webhook:', subscriptionRenewsAt)
        }
      } catch (error) {
        console.error('Error converting current_period_end:', expandedSubscription.current_period_end, error)
      }
    }

    // Fallback to Stripe API if webhook data failed
    if (!subscriptionRenewsAt) {
      console.log('🔍 Fetching subscription details from Stripe API for renewal date')
      try {
        const subscriptionDetails = await getStripeSubscriptionDetails(subscription.id)
        if (subscriptionDetails?.currentPeriodEnd) {
          subscriptionRenewsAt = subscriptionDetails.currentPeriodEnd.toISOString()
          console.log('📅 Got renewal date from Stripe API:', subscriptionRenewsAt)
        }
      } catch (error) {
        console.error('Error fetching subscription details from Stripe:', error)
      }
    }
  }

  await updateUserSubscription(customerId, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: status,
    subscriptionRenewsAt
  })

  console.log('✅ User subscription created with status:', status)

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
  console.log('🔄 Processing customer.subscription.updated for subscription:', subscription.id)
  const expandedSubscription = subscription as StripeSubscriptionExpanded
  console.log('Subscription status:', subscription.status)
  console.log('Cancel at period end:', expandedSubscription.cancel_at_period_end)
  console.log('Current period end:', expandedSubscription.current_period_end, typeof expandedSubscription.current_period_end)

  const customerId = subscription.customer as string

  // GUARD: Skip webhook for staff members
  const status = mapStripeStatusToInternal(subscription.status)
  const cancelAtPeriodEnd = expandedSubscription.cancel_at_period_end || false

  // Get renewal date for active subscriptions, clear for inactive ones
  let subscriptionRenewsAt: string | null = null
  if (status === 'active') {
    // Try to get renewal date from webhook event data first
    if (expandedSubscription.current_period_end) {
      try {
        const convertedDate = convertStripeTimestamp(expandedSubscription.current_period_end)
        if (convertedDate) {
          subscriptionRenewsAt = convertedDate.toISOString()
          console.log('📅 Got renewal date from webhook:', subscriptionRenewsAt)
        }
      } catch (error) {
        console.error('Error converting current_period_end:', expandedSubscription.current_period_end, error)
      }
    }

    // Fallback to Stripe API if webhook data failed
    if (!subscriptionRenewsAt) {
      console.log('🔍 Fetching subscription details from Stripe API for renewal date')
      try {
        const subscriptionDetails = await getStripeSubscriptionDetails(subscription.id)
        if (subscriptionDetails?.currentPeriodEnd) {
          subscriptionRenewsAt = subscriptionDetails.currentPeriodEnd.toISOString()
          console.log('📅 Got renewal date from Stripe API:', subscriptionRenewsAt)
        }
      } catch (error) {
        console.error('Error fetching subscription details from Stripe:', error)
      }
    }
  }

  // Set membershipExpiration when subscription is cancelled but still active
  // Clear it when subscription is reactivated or renewed
  let membershipExpiration: string | null = null
  if (cancelAtPeriodEnd && status === 'active') {
    // Subscription cancelled but still active until period end
    if (expandedSubscription.current_period_end) {
      try {
        const convertedDate = convertStripeTimestamp(expandedSubscription.current_period_end)
        if (convertedDate) {
          membershipExpiration = convertedDate.toISOString()
          console.log('📅 Subscription cancelled but active until:', membershipExpiration)
        }
      } catch (error) {
        console.error('Error converting expiration date from webhook event:', error)
      }
    } else {
      // Fetch subscription details from Stripe API to get the period end date
      console.log('🔍 Fetching subscription details from Stripe API for period end date')
      try {
        const subscriptionDetails = await getStripeSubscriptionDetails(subscription.id)
        if (subscriptionDetails?.currentPeriodEnd) {
          membershipExpiration = subscriptionDetails.currentPeriodEnd.toISOString()
          console.log('📅 Subscription cancelled but active until (from API):', membershipExpiration)
        }
      } catch (error) {
        console.error('Error fetching subscription details from Stripe:', error)
      }
    }
  } else if (!cancelAtPeriodEnd && status === 'active') {
    // Subscription was reactivated or renewed - clear expiration and cancel flag
    membershipExpiration = null
    console.log('🔄 Subscription active and renewing - clearing membership expiration and cancel flag')
  }

  await updateUserSubscription(customerId, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: status,
    subscriptionRenewsAt,
    cancelAtPeriodEnd,
    membershipExpiration
  })

  console.log('✅ User subscription updated to status:', status, 'cancelAtPeriodEnd:', cancelAtPeriodEnd)
}

/**
 * Handle subscription deletion/cancellation
 * Honor the paid period by setting membershipExpiration to current_period_end
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('❌ Processing customer.subscription.deleted for subscription:', subscription.id)

  const customerId = subscription.customer as string

  const expandedSubscription = subscription as StripeSubscriptionExpanded

  // Calculate when the paid period actually ends
  const currentPeriodEnd = convertStripeTimestamp(expandedSubscription.current_period_end)
  const now = new Date()

  // If the subscription period hasn't ended yet, honor the paid time
  let membershipExpiration: string | null = null
  if (currentPeriodEnd && currentPeriodEnd > now) {
    membershipExpiration = currentPeriodEnd.toISOString()
    console.log('📅 Honoring paid period until:', membershipExpiration)
  } else if (!currentPeriodEnd) {
    console.warn('⚠️ Could not convert subscription period end date, treating as immediate revocation')
  } else {
    console.log('⏰ Subscription period already ended, immediate revocation')
  }

  await updateUserSubscription(customerId, {
    subscriptionStatus: 'cancelled',
    membershipExpiration,
    subscriptionRenewsAt: null, // Clear renewal date for cancelled subscriptions
    cancelAtPeriodEnd: false // Clear cancel flag since subscription is now fully deleted
  })

  console.log('✅ User subscription cancelled')

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
  console.log('💰 Processing invoice.payment_succeeded for invoice:', invoice.id)
  console.log('Invoice customer:', invoice.customer, typeof invoice.customer)
  console.log('Invoice subscription:', (invoice as any).subscription, typeof (invoice as any).subscription)
  console.log('Invoice billing_reason:', (invoice as any).billing_reason)

  const customerId = invoice.customer as string

  // Check if this invoice is related to a subscription
  let subscriptionId: string | null = null

  if ((invoice as any).subscription) {
    subscriptionId = (invoice as any).subscription as string
    console.log('✅ Found subscription via direct field:', subscriptionId)
  } else if ((invoice as any).subscription_id) {
    subscriptionId = (invoice as any).subscription_id as string
    console.log('✅ Found subscription via subscription_id field:', subscriptionId)
  } else {
    // Webhook event may not have subscription field populated
    // Fetch full invoice from Stripe API to get subscription ID
    console.log('🔍 Subscription field missing from webhook, fetching full invoice')
    try {
      if (!invoice.id) {
        throw new Error('Invoice ID is missing')
      }
      const stripeInvoice = await stripe.invoices.retrieve(invoice.id)
      const invoiceData = stripeInvoice as any
      if (invoiceData.subscription) {
        subscriptionId = invoiceData.subscription as string
        console.log('✅ Found subscription via API fetch:', subscriptionId)
      }
    } catch (error) {
      console.error('Error fetching invoice from Stripe API:', error)
    }
  }

  if (!subscriptionId) {
    console.log('Invoice not related to subscription, skipping')
    return
  }

  const billingReason = (invoice as any).billing_reason

  console.log('✅ Payment successful for subscription:', subscriptionId, '- billing reason:', billingReason)

  // For renewal payments, update the subscription renewal date
  if (billingReason === 'subscription_cycle') {
    console.log('🔄 Regular renewal payment processed - fetching updated renewal date')
    try {
      const subscriptionDetails = await getStripeSubscriptionDetails(subscriptionId)
      if (subscriptionDetails?.currentPeriodEnd) {
        const updatedRenewalDate = subscriptionDetails.currentPeriodEnd.toISOString()
        console.log('📅 Updating renewal date for subscription:', updatedRenewalDate)

        await updateUserSubscription(customerId, {
          subscriptionRenewsAt: updatedRenewalDate
        })

        console.log('✅ Renewal date updated successfully')
      }
    } catch (error) {
      console.error('⚠️ Failed to update renewal date on subscription renewal:', error)
      // Don't fail the webhook if renewal date update fails - the subscription is still active
    }
  }

  // Send membership confirmation email only for new subscriptions
  // Regular renewals are handled silently (renewal date already updated above)
  if (billingReason === 'subscription_create') {
    console.log('📧 Sending membership confirmation for new subscription')
    await sendMembershipConfirmationAfterPayment(customerId, subscriptionId, true)
  }
}

/**
 * Handle failed invoice payments
 * This can lead to past_due status
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('💸 Processing invoice.payment_failed for invoice:', invoice.id)

  if (!(invoice as any).subscription) {
    console.log('Invoice not related to subscription, skipping')
    return
  }

  const customerId = invoice.customer as string

  // Mark as past due, but don't immediately revoke membership
  // Stripe will handle the subscription status updates
  await updateUserSubscription(customerId, {
    subscriptionStatus: 'past_due'
  })

  console.log('⚠️ User subscription marked as past due due to payment failure')
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
      console.error('❌ No VisitorProfile found for membership confirmation email:', customerId)
      return
    }

    // Get subscription details for the email
    const subscriptionDetails = await getStripeSubscriptionDetails(subscriptionId)
    if (!subscriptionDetails) {
      console.error('❌ Could not retrieve subscription details for email:', subscriptionId)
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

    console.log('✅ Membership confirmation email sent to:', profile.email)
  } catch (error) {
    console.error('❌ Failed to send membership confirmation email:', error)
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
      console.error('❌ No VisitorProfile found for cancellation email:', customerId)
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

    console.log('✅ Subscription cancellation email sent to:', profile.email)
  } catch (error) {
    console.error('❌ Failed to send subscription cancellation email:', error)
  }
}
