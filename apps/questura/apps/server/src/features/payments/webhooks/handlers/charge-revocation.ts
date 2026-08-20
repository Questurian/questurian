import type Stripe from 'stripe'
import { cancelRefundedSubscription, writeAccessRevocation } from '@/payments/lib/access-revocation'
import { stripe } from '@/payments/lib/stripe'
import { resyncSubscription } from '@/payments/lib/subscription-resync'
import {
  ACCESS_REVOKED_REASON_DISPUTE,
  ACCESS_REVOKED_REASON_REFUND,
  readAccessRevocation,
  type AccessRevocation,
  type AccessRevokedReason,
} from '@/payments/lib/subscription-state'
import { logger } from '@/shared/utils/logger'
import { resolveInvoiceSubscriptionId } from '../invoice-subscription'

const RESTORE_ON_DISPUTE_STATUS = new Set<Stripe.Dispute.Status>(['won', 'warning_closed'])

/** The one closing status that means the money went back and is not coming again. */
const DISPUTE_STATUS_LOST: Stripe.Dispute.Status = 'lost'

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

/**
 * Record the revocation on Stripe, then bring the profile in line with it.
 *
 * Stripe is the preferred home for the flag because every later resync refetches
 * the subscription and would otherwise re-derive access from a period the
 * visitor was refunded for.
 *
 * A cancelled subscription *does* take a metadata-only write — observed on this
 * account 2026-08-19, where `sub_1U5yA8` carried all three revocation keys
 * despite having been cancelled 42 minutes before the refund that wrote them.
 * The `flagged === false` fallback below is therefore defensive, not the usual
 * path: it exists because Stripe documents no guarantee either way, so a future
 * tightening would otherwise silently leave the profile un-revoked. When the
 * write is refused the revocation is handed straight to the resync instead, and
 * the profile is what gates access, so it ends up correct either way.
 */
async function markAccessRevoked(
  subscriptionId: string,
  revocation: AccessRevocation | null,
  options: { cancelSubscription?: boolean } = {}
) {
  const flagged = await writeAccessRevocation(subscriptionId, revocation)

  // After the flag, because Stripe will not take a metadata write on a
  // subscription that is already cancelled; before the resync, so the profile is
  // written once, from a subscription that is already in its final state.
  if (options.cancelSubscription) await cancelRefundedSubscription(subscriptionId)

  if (flagged) {
    await resyncSubscription(subscriptionId)
    return
  }

  await resyncSubscription(subscriptionId, { accessRevoked: revocation })
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

  await markAccessRevoked(
    subscriptionId,
    { reason, periodEnd: end },
    // A refund ends the arrangement, so the subscription has to stop billing.
    // A dispute is money still being contested and may be won, and a cancelled
    // subscription cannot be revived — so that one is left running until
    // `charge.dispute.closed` says which way it went.
    { cancelSubscription: reason === ACCESS_REVOKED_REASON_REFUND }
  )
}

/**
 * Full refunds and disputes must not leave `paidThroughAt` at period end.
 *
 * A cancelled sub still reports the period that was (no longer) paid for.
 * Writing `access_revoked` onto the subscription makes every later resync —
 * including `subscription.deleted` — clear entitlement instead of restoring it.
 *
 * The refund also cancels the subscription, because Stripe does not: revoking
 * access while billing continues charges the visitor for a month they cannot
 * use. Partial refunds are left alone on both counts: those are often
 * corrections, not "this period was never paid".
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

/**
 * The revocation on the subscription right now, when it is not the one this
 * dispute wrote.
 *
 * A revocation is three scalar metadata keys, so a subscription only ever holds
 * the most recent one. Clearing on a won dispute therefore clears whatever is
 * there — including a revocation some *later* event wrote for a different
 * period. The order that does damage: a dispute opens on January's charge, then
 * February's charge is refunded in full and overwrites the flag, then the
 * January dispute is won and lifts the refund's revocation with it. The visitor
 * keeps access to a period they were given their money back for, and
 * `clearRefundRevocationOnNewPeriod` cannot help — it only ever clears.
 *
 * The dispute's own revocation is recognised by reason *and* period end, so a
 * second dispute still open on another period is held onto too. Anything that
 * is not this dispute's stays, and the resync re-reads it rather than being
 * handed a null.
 *
 * One extra retrieve, only on the restoring path.
 */
async function revocationOutlivingThisDispute(
  subscriptionId: string,
  disputedPeriodEnd: number | null
): Promise<AccessRevocation | null> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const current = readAccessRevocation(subscription)

  if (!current) return null
  if (current.reason === ACCESS_REVOKED_REASON_DISPUTE && current.periodEnd === disputedPeriodEnd) {
    return null
  }

  return current
}

/**
 * Resolve a dispute: restore the membership, or end the arrangement with it.
 *
 * A won dispute clears the flag and leaves the subscription alone — that is why
 * `charge.dispute.created` never cancels, since a cancel cannot be undone.
 *
 * A lost dispute is the other terminal end: the money is back with the visitor,
 * so it is treated exactly like a refund and the subscription is cancelled. The
 * flag alone was not enough. `deriveSubscriptionState` pins `paidThroughAt` to
 * null for as long as it is set, and `invoice.payment_succeeded` may only lift a
 * *refund* revocation, so a live subscription renewed month after month behind a
 * permanent dispute flag: charged every cycle, never let back in, with no event
 * left that could recover it. Cancelling is the missing half of "money returned
 * = arrangement over".
 *
 * Only `lost` cancels. Any other non-restoring status is left billing for a
 * later event to resolve, because the cancel is the irreversible direction.
 */
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
  const lost = dispute.status === DISPUTE_STATUS_LOST
  const disputedPeriodEnd = invoicePeriod(invoice).end

  const outliving = restore
    ? await revocationOutlivingThisDispute(subscriptionId, disputedPeriodEnd)
    : null

  if (outliving) {
    logger.warn('Won dispute left the membership revoked; a later event revoked it again', {
      disputeId: dispute.id,
      subscriptionId,
      status: dispute.status,
      heldReason: outliving.reason,
      heldPeriodEnd: outliving.periodEnd,
    })

    // The flag on Stripe is already the one to keep, so the resync re-reads it
    // rather than being handed anything.
    await resyncSubscription(subscriptionId)
    return
  }

  logger.info(
    restore
      ? 'Restoring membership after won dispute'
      : lost
        ? 'Keeping membership revoked and stopping billing after lost dispute'
        : 'Keeping membership revoked while the dispute is unresolved',
    {
      disputeId: dispute.id,
      subscriptionId,
      status: dispute.status,
    }
  )

  await markAccessRevoked(
    subscriptionId,
    restore ? null : { reason: ACCESS_REVOKED_REASON_DISPUTE, periodEnd: disputedPeriodEnd },
    // The money is gone for good, so the subscription must stop charging for it.
    { cancelSubscription: lost }
  )
}
