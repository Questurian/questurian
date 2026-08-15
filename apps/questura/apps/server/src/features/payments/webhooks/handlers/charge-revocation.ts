import type Stripe from 'stripe'
import { stripe } from '@/payments/lib/stripe'
import { resyncSubscription } from '@/payments/lib/subscription-resync'
import {
  ACCESS_REVOKED_METADATA_KEY,
  ACCESS_REVOKED_METADATA_VALUE,
  ACCESS_REVOKED_PERIOD_END_METADATA_KEY,
  ACCESS_REVOKED_REASON_DISPUTE,
  ACCESS_REVOKED_REASON_METADATA_KEY,
  ACCESS_REVOKED_REASON_REFUND,
  type AccessRevokedReason,
} from '@/payments/lib/subscription-state'
import { logger } from '@/shared/utils/logger'
import { resolveInvoiceSubscriptionId } from '../invoice-subscription'

const RESTORE_ON_DISPUTE_STATUS = new Set<Stripe.Dispute.Status>(['won', 'warning_closed'])

/** `invoice` is on the wire but absent from the pinned SDK's `Charge`. */
type ChargeWithInvoice = Stripe.Charge & {
  invoice?: string | Stripe.Invoice | null
}

/** The subscription period a charge's invoice covers, in Stripe's seconds. */
type InvoicePeriod = { end: number | null }

async function resolveChargeInvoice(charge: Stripe.Charge): Promise<Stripe.Invoice | null> {
  const chargeInvoice = (charge as ChargeWithInvoice).invoice
  const invoiceId = typeof chargeInvoice === 'string' ? chargeInvoice : chargeInvoice?.id
  if (!invoiceId) return null

  return typeof chargeInvoice === 'object' && chargeInvoice && 'id' in chargeInvoice
    ? chargeInvoice
    : stripe.invoices.retrieve(invoiceId)
}

function invoicePeriod(invoice: Stripe.Invoice): InvoicePeriod {
  return { end: invoice.lines?.data?.[0]?.period?.end ?? null }
}

async function chargeFromDispute(dispute: Stripe.Dispute): Promise<Stripe.Charge | null> {
  if (typeof dispute.charge !== 'string') {
    return dispute.charge ?? null
  }

  return stripe.charges.retrieve(dispute.charge)
}

async function markAccessRevoked(
  subscriptionId: string,
  revocation: { reason: AccessRevokedReason; periodEnd: number | null } | null
) {
  // Stripe deletes a metadata key when its value is the empty string, so a
  // restore clears all three in one update.
  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      [ACCESS_REVOKED_METADATA_KEY]: revocation ? ACCESS_REVOKED_METADATA_VALUE : '',
      [ACCESS_REVOKED_REASON_METADATA_KEY]: revocation ? revocation.reason : '',
      [ACCESS_REVOKED_PERIOD_END_METADATA_KEY]:
        revocation && revocation.periodEnd ? String(revocation.periodEnd) : '',
    },
  })

  await resyncSubscription(subscriptionId)
}

async function revokeForCharge(
  charge: Stripe.Charge,
  reason: AccessRevokedReason,
  event: string
) {
  const invoice = await resolveChargeInvoice(charge)
  const subscriptionId = invoice ? await resolveInvoiceSubscriptionId(invoice) : null

  if (!invoice || !subscriptionId) {
    logger.warn('Refund or dispute has no subscription; cannot revoke membership', {
      chargeId: charge.id,
      reason: event,
    })
    return
  }

  const { end } = invoicePeriod(invoice)

  logger.warn('Revoking membership after refund or dispute', {
    chargeId: charge.id,
    subscriptionId,
    reason: event,
    revokedPeriodEnd: end,
  })

  await markAccessRevoked(subscriptionId, { reason, periodEnd: end })
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

  await revokeForCharge(charge, ACCESS_REVOKED_REASON_REFUND, 'charge.refunded')
}

export async function handleDisputeCreated(dispute: Stripe.Dispute) {
  logger.info('Processing charge.dispute.created', { disputeId: dispute.id })

  const charge = await chargeFromDispute(dispute)
  if (!charge) {
    logger.warn('Dispute has no charge; cannot revoke membership', { disputeId: dispute.id })
    return
  }

  await revokeForCharge(charge, ACCESS_REVOKED_REASON_DISPUTE, 'charge.dispute.created')
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

  const invoice = await resolveChargeInvoice(charge)
  const subscriptionId = invoice ? await resolveInvoiceSubscriptionId(invoice) : null
  if (!invoice || !subscriptionId) {
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

  await markAccessRevoked(
    subscriptionId,
    restore
      ? null
      : { reason: ACCESS_REVOKED_REASON_DISPUTE, periodEnd: invoicePeriod(invoice).end }
  )
}
