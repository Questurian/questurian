/**
 * Audit: subscriptions held behind `access_revoked`
 *
 * Why this exists
 * ---------------
 * A fully refunded charge writes `access_revoked` onto the Stripe
 * subscription, and `deriveSubscriptionState` then reports `paidThroughAt:
 * null` for as long as it is set. Until the renewal-clears-a-refund handling
 * shipped, the only thing that ever cleared it was a won dispute — so a refund
 * on a subscription Stripe kept billing produced a visitor who paid every month
 * and had access to nothing, with no signal anywhere that it had happened.
 *
 * A refund now also cancels the subscription, so no new case should be created:
 * the money stops at the same moment the access does. The renewal-clears-a-
 * refund handling remains for the ones that predate the cancel, and for a
 * subscription resumed by hand in the Dashboard — but it only heals them at
 * their next successful renewal, up to a year away on a yearly plan. This
 * script finds the ones already in that state so they can be resolved by hand
 * instead of waited out.
 *
 * What it reports
 * ---------------
 *   STUCK      Revoked for a refund, still billing, and the subscription has
 *              moved past the period that was refunded. Someone is paying for
 *              access they do not have. Resolve by hand.
 *   IN_PERIOD  Revoked for a refund and still inside the refunded period. This
 *              is correct — the visitor has not paid for where they are.
 *   CONTESTED  Revoked for a dispute. Correct until the dispute closes; only
 *              `charge.dispute.closed` may resolve one.
 *   UNKNOWN    Revoked before the reason and period were recorded. Cannot be
 *              classified from metadata alone; check the charge by hand.
 *   CLOSED     Revoked on a subscription that is no longer billing. Nothing is
 *              being charged, so nothing is owed.
 *
 * Safety
 * ------
 * Read-only, with no apply mode. It reads Stripe and `visitor-profiles` and
 * writes to neither. Clearing a flag means deleting `access_revoked` from the
 * subscription's metadata in the Stripe Dashboard, which emits
 * `customer.subscription.updated` and lets the normal resync restore
 * entitlement. Doing that by hand is deliberate: each row is a decision about
 * somebody's money.
 *
 * Usage:
 *   pnpm exec tsx scripts/audit-access-revocations.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import Stripe from 'stripe'

import config from '../src/payload.config'
import {
  ACCESS_REVOKED_METADATA_KEY,
  ACCESS_REVOKED_METADATA_VALUE,
  ACCESS_REVOKED_PERIOD_END_METADATA_KEY,
  ACCESS_REVOKED_REASON_DISPUTE,
  ACCESS_REVOKED_REASON_METADATA_KEY,
  ACCESS_REVOKED_REASON_REFUND,
  getSubscriptionPeriodSeconds,
} from '../src/features/payments/lib/subscription-state'

type Classification = 'STUCK' | 'IN_PERIOD' | 'CONTESTED' | 'UNKNOWN' | 'CLOSED'

type Finding = {
  classification: Classification
  subscriptionId: string
  customerId: string
  status: Stripe.Subscription.Status
  reason: string | null
  revokedPeriodEnd: number | null
  currentPeriodStart: number | null
  profileEmail: string | null
  profilePaidThroughAt: string | null
}

/** Statuses Stripe is still collecting on. Anything else owes nobody access. */
const BILLING_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
])

function formatTimestamp(seconds: number | null): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

function classify(
  subscription: Stripe.Subscription,
  reason: string | null,
  revokedPeriodEnd: number | null,
  currentPeriodStart: number | null
): Classification {
  if (!BILLING_STATUSES.has(subscription.status)) return 'CLOSED'
  if (reason === ACCESS_REVOKED_REASON_DISPUTE) return 'CONTESTED'
  if (reason !== ACCESS_REVOKED_REASON_REFUND) return 'UNKNOWN'

  // Without a recorded period there is nothing to compare against, so the
  // refund cannot be shown to be spent.
  if (!revokedPeriodEnd || currentPeriodStart === null) return 'UNKNOWN'

  return currentPeriodStart >= revokedPeriodEnd ? 'STUCK' : 'IN_PERIOD'
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required to audit revocations against Stripe')
  }

  const stripe = new Stripe(secretKey)
  const payload = await getPayload({ config })

  console.log('🔍 Read-only audit — nothing will be written to Stripe or Payload\n')

  const profiles = await payload.find({
    collection: 'visitor-profiles',
    limit: 0,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  const profileByCustomerId = new Map<string, (typeof profiles.docs)[number]>()
  for (const profile of profiles.docs) {
    const customerId = profile.stripeCustomerId as string | null
    if (customerId) profileByCustomerId.set(customerId, profile)
  }

  console.log(`Loaded ${profiles.docs.length} visitor profile(s)`)

  // Walked rather than searched: Stripe's search index lags writes by about a
  // minute, and a subscription missed by an audit of who is locked out is worse
  // than a slower scan.
  const findings: Finding[] = []
  let scanned = 0

  for await (const subscription of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    scanned += 1

    const metadata = subscription.metadata ?? {}
    if (metadata[ACCESS_REVOKED_METADATA_KEY] !== ACCESS_REVOKED_METADATA_VALUE) continue

    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : (subscription.customer?.id ?? '')
    const profile = profileByCustomerId.get(customerId)

    const reason = metadata[ACCESS_REVOKED_REASON_METADATA_KEY] || null
    const parsedPeriodEnd = Number(metadata[ACCESS_REVOKED_PERIOD_END_METADATA_KEY])
    const revokedPeriodEnd =
      Number.isFinite(parsedPeriodEnd) && parsedPeriodEnd > 0 ? parsedPeriodEnd : null
    const { start: currentPeriodStart } = getSubscriptionPeriodSeconds(subscription)

    findings.push({
      classification: classify(subscription, reason, revokedPeriodEnd, currentPeriodStart),
      subscriptionId: subscription.id,
      customerId,
      status: subscription.status,
      reason,
      revokedPeriodEnd,
      currentPeriodStart,
      profileEmail: (profile?.email as string) ?? null,
      profilePaidThroughAt: (profile?.paidThroughAt as string) ?? null,
    })
  }

  console.log(`Scanned ${scanned} Stripe subscription(s)\n`)

  const order: Classification[] = ['STUCK', 'UNKNOWN', 'IN_PERIOD', 'CONTESTED', 'CLOSED']
  const byClassification = new Map<Classification, Finding[]>(
    order.map((classification) => [
      classification,
      findings.filter((finding) => finding.classification === classification),
    ])
  )

  for (const classification of order) {
    console.log(`${classification.padEnd(10)}: ${byClassification.get(classification)!.length}`)
  }
  console.log('')

  if (findings.length === 0) {
    console.log('✅ No subscription is carrying access_revoked.')
    return
  }

  for (const classification of order) {
    const rows = byClassification.get(classification)!
    if (rows.length === 0) continue

    for (const row of rows) {
      console.log(
        `  [${row.classification}] ${row.subscriptionId} <${row.profileEmail ?? 'no profile'}>`
      )
      console.log(
        `      stripe=${row.status} reason=${row.reason ?? 'unrecorded'}` +
          ` revoked_through=${formatTimestamp(row.revokedPeriodEnd)}` +
          ` now_in_period_from=${formatTimestamp(row.currentPeriodStart)}` +
          ` profile_paid_through=${row.profilePaidThroughAt ?? 'null'}`
      )
    }
  }

  const stuck = byClassification.get('STUCK')!
  const unknown = byClassification.get('UNKNOWN')!

  if (stuck.length > 0) {
    console.log(
      `\n⚠️  ${stuck.length} subscription(s) are being billed while access is revoked.`
    )
    console.log('   Each is someone paying for nothing. To release one, delete the')
    console.log(`   \`${ACCESS_REVOKED_METADATA_KEY}\` key from the subscription's metadata in the`)
    console.log('   Stripe Dashboard; the resulting customer.subscription.updated event')
    console.log('   resyncs the profile and restores entitlement.')
  }

  if (unknown.length > 0) {
    console.log(
      `\n⚠️  ${unknown.length} revocation(s) predate the recorded reason and period.`
    )
    console.log('   Read the refund or dispute on the subscription before deciding.')
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Revocation audit failed:', error)
    process.exit(1)
  })
