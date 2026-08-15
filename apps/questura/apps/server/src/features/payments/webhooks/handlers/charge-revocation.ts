import type Stripe from 'stripe'
import { stripe } from '@/payments/lib/stripe'
import { resyncSubscription } from '@/payments/lib/subscription-resync'
import {
  ACCESS_REVOKED_METADATA_KEY,
  ACCESS_REVOKED_METADATA_VALUE,
} from '@/payments/lib/subscription-state'
import { logger } from '@/shared/utils/logger'
import { resolveInvoiceSubscriptionId } from '../invoice-subscription'

const RESTORE_ON_DISPUTE_STATUS = new Set<Stripe.Dispute.Status>(['won', 'warning_closed'])

async function resolveChargeSubscriptionId(charge: Stripe.Charge): Promise<string | null> {
  const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id
  if (!invoiceId) return null

  const invoice =
    typeof charge.invoice === 'object' && charge.invoice && 'id' in charge.invoice
      ? (charge.invoice as Stripe.Invoice)
      : await stripe.invoices.retrieve(invoiceId)

  return resolveInvoiceSubscriptionId(invoice)
}

async function chargeFromDispute(dispute: Stripe.Dispute): Promise<Stripe.Charge | null> {
  if (typeof dispute.charge !== 'string') {
    return dispute.charge ?? null
  }

  return stripe.charges.retrieve(dispute.charge)
}

async function markAccessRevoked(subscriptionId: string, revoked: boolean) {
  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      [ACCESS_REVOKED_METADATA_KEY]: revoked ? ACCESS_REVOKED_METADATA_VALUE : '',
    },
  })

  await resyncSubscription(subscriptionId)
}

async function revokeForCharge(charge: Stripe.Charge, reason: string) {
  const subscriptionId = await resolveChargeSubscriptionId(charge)

  if (!subscriptionId) {
    logger.warn('Refund or dispute has no subscription; cannot revoke membership', {
      chargeId: charge.id,
      reason,
    })
    return
  }

  logger.warn('Revoking membership after refund or dispute', {
    chargeId: charge.id,
    subscriptionId,
    reason,
  })

  await markAccessRevoked(subscriptionId, true)
}

/**
 * Full refunds and disputes must not leave `paidThroughAt` at period end.
 *
 * Stripe may cancel the subscription, but a cancelled sub still reports the
 * period that was (no longer) paid for. Writing `access_revoked` onto the
 * subscription makes every later resync — including `subscription.deleted` —
 * clear entitlement instead of restoring it. Partial refunds are left alone:
 * those are often corrections, not "this period was never paid".
 */
export async function handleChargeRefunded(charge: Stripe.Charge) {
  logger.info('Processing charge.refunded', { chargeId: charge.id })

  if (!charge.refunded) {
    logger.info('Partial refund ignored; membership unchanged', { chargeId: charge.id })
    return
  }

  await revokeForCharge(charge, 'charge.refunded')
}

export async function handleDisputeCreated(dispute: Stripe.Dispute) {
  logger.info('Processing charge.dispute.created', { disputeId: dispute.id })

  const charge = await chargeFromDispute(dispute)
  if (!charge) {
    logger.warn('Dispute has no charge; cannot revoke membership', { disputeId: dispute.id })
    return
  }

  await revokeForCharge(charge, 'charge.dispute.created')
}

export async function handleDisputeClosed(dispute: Stripe.Dispute) {
  logger.info('Processing charge.dispute.closed', {
    disputeId: dispute.id,
    status: dispute.status,
  })

  const charge = await chargeFromDispute(dispute)
  if (!charge) {
    logger.warn('Closed dispute has no charge; cannot update membership', { disputeId: dispute.id })
    return
  }

  const subscriptionId = await resolveChargeSubscriptionId(charge)
  if (!subscriptionId) {
    logger.warn('Closed dispute has no subscription; cannot update membership', {
      disputeId: dispute.id,
      chargeId: charge.id,
    })
    return
  }

  const restore = RESTORE_ON_DISPUTE_STATUS.has(dispute.status)

  logger.info(restore ? 'Restoring membership after won dispute' : 'Keeping membership revoked after lost dispute', {
    disputeId: dispute.id,
    subscriptionId,
    status: dispute.status,
  })

  await markAccessRevoked(subscriptionId, !restore)
}
