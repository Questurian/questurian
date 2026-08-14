/**
 * Stripe -> visitor_profiles reconciliation
 *
 * Why this exists
 * ---------------
 * `ensureVisitorAuthSchema` used to DELETE orphaned `visitor_profiles` rows on
 * every boot, and admins can hard-delete a profile by hand. Those rows hold the
 * only copy of the Stripe linkage (`stripeCustomerId`, `stripeSubscriptionId`,
 * `subscriptionStatus`, `paidThroughAt`). Hardening the sweep stops the
 * bleeding but recovers nothing already lost.
 *
 * Stripe is the durable source of truth for customer and subscription state, so
 * reading it back is both the diagnostic ("did we already lose linkage, and how
 * much?") and the repair.
 *
 * What it reports
 * ---------------
 *   RELINKABLE  A Stripe customer whose email matches a profile that has no
 *               `stripeCustomerId`. Repairable here.
 *   DRIFTED     Linked profile whose subscription state disagrees with Stripe.
 *               Repairable here.
 *   ORPHANED    A Stripe customer with a LIVE subscription and no profile at
 *               all -- someone is paying and has no account to grant it to.
 *               This is the signature of a destroyed profile. NOT repairable
 *               here: recreating a profile needs an auth user to key on, and
 *               `authUserId` is not derivable from Stripe. Reported for hand
 *               resolution.
 *   DUPLICATE   Several Stripe customers share one email -- the second-customer
 *               bug. Reported so billing can be merged in Stripe by hand;
 *               merging customers is not something to automate.
 *
 * Safety
 * ------
 * Dry-run by default: prints the plan and writes nothing. Pass `--apply` to
 * write. It only ever fills in or corrects linkage on existing profiles; it
 * never creates, deletes, or reassigns a profile, and never writes to Stripe.
 *
 * Usage:
 *   pnpm exec tsx scripts/reconcile-stripe-visitor-profiles.ts
 *   pnpm exec tsx scripts/reconcile-stripe-visitor-profiles.ts --apply
 *   pnpm exec tsx scripts/reconcile-stripe-visitor-profiles.ts --apply --limit 50
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import Stripe from 'stripe'

import config from '../src/payload.config'
import { deriveSubscriptionState } from '../src/features/payments/lib/subscription-state'

type PlannedUpdate = {
  profileId: string | number
  email: string
  changes: Record<string, unknown>
  reason: 'RELINKABLE' | 'DRIFTED'
}

const APPLY = process.argv.includes('--apply')

function parseLimit(): number | null {
  const index = process.argv.indexOf('--limit')
  if (index === -1) return null
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Subscription states that still grant, or could still grant, paid access.
 * Anything else is a closed record rather than something to reconcile.
 */
const LIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
])

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required to reconcile against Stripe')
  }

  const stripe = new Stripe(secretKey)
  const payload = await getPayload({ config })
  const limit = parseLimit()

  console.log(APPLY ? '⚠️  APPLY mode — profiles will be written' : '🔍 Dry run — nothing will be written')

  // ---- Load every visitor profile, indexed by email and by customer id ------
  const profiles = await payload.find({
    collection: 'visitor-profiles',
    limit: 0, // all
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  const byEmail = new Map<string, (typeof profiles.docs)[number][]>()
  const byCustomerId = new Map<string, (typeof profiles.docs)[number]>()

  for (const profile of profiles.docs) {
    const email = normalizeEmail(profile.email as string)
    if (email) {
      const bucket = byEmail.get(email) ?? []
      bucket.push(profile)
      byEmail.set(email, bucket)
    }
    const customerId = profile.stripeCustomerId as string | null
    if (customerId) byCustomerId.set(customerId, profile)
  }

  console.log(`Loaded ${profiles.docs.length} visitor profile(s)\n`)

  // ---- Walk Stripe customers ----------------------------------------------
  const updates: PlannedUpdate[] = []
  const orphaned: Array<{ customerId: string; email: string; status: string }> = []
  let historicalOrphans = 0
  const duplicates = new Map<string, string[]>()
  const seenEmails = new Map<string, string[]>()

  let scanned = 0

  for await (const customer of stripe.customers.list({ limit: 100 })) {
    if (limit && scanned >= limit) break
    scanned += 1

    if (customer.deleted) continue

    const email = normalizeEmail(customer.email)
    if (!email) continue

    const emailBucket = seenEmails.get(email) ?? []
    emailBucket.push(customer.id)
    seenEmails.set(email, emailBucket)
    if (emailBucket.length > 1) duplicates.set(email, emailBucket)

    // Newest subscription wins; Stripe returns most recent first.
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 1,
      // The dunning grace is derived from Stripe's own next retry time, which
      // lives on the invoice.
      expand: ['data.latest_invoice'],
    })
    const subscription = subscriptions.data[0] ?? null

    const linked = byCustomerId.get(customer.id)
    const candidates = byEmail.get(email) ?? []

    if (!linked && candidates.length === 0) {
      if (subscription) {
        // Only a subscription that could still grant access is a problem. A
        // customer whose subscription ended and whose profile is gone is
        // history: there is nothing to repair and nothing to grant, so warning
        // about it every run trains people to ignore the warning.
        if (LIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
          orphaned.push({ customerId: customer.id, email, status: subscription.status })
        } else {
          historicalOrphans += 1
        }
      }
      continue
    }

    // Prefer the already-linked profile; otherwise adopt the sole email match.
    // Ambiguous email matches are left alone rather than guessed at.
    const profile = linked ?? (candidates.length === 1 ? candidates[0] : null)

    if (!profile) {
      console.warn(
        `⚠️  ${email}: ${candidates.length} profiles share this email — skipping, resolve by hand`
      )
      continue
    }

    const desired: Record<string, unknown> = {}

    if (!profile.stripeCustomerId) {
      desired.stripeCustomerId = customer.id
    }

    if (subscription) {
      // Reuse the webhook's own derivation rather than restating it, so a
      // reconciliation run and a live resync cannot disagree about what a
      // Stripe subscription means. This previously read `current_period_end`
      // off the subscription root, which the SDK's API version does not
      // populate, and restated the paid-access rule by hand.
      const invoice = subscription.latest_invoice
      const state = deriveSubscriptionState(subscription, {
        previousDunningGraceUntil: profile.dunningGraceUntil,
        nextPaymentAttempt:
          invoice && typeof invoice !== 'string' ? (invoice.next_payment_attempt ?? null) : null,
      })

      if (profile.stripeSubscriptionId !== subscription.id) {
        desired.stripeSubscriptionId = subscription.id
      }
      if (profile.subscriptionStatus !== state.subscriptionStatus) {
        desired.subscriptionStatus = state.subscriptionStatus
      }
      if (Boolean(profile.cancelAtPeriodEnd) !== state.cancelAtPeriodEnd) {
        desired.cancelAtPeriodEnd = state.cancelAtPeriodEnd
      }
      if ((profile.paidThroughAt ?? null) !== state.paidThroughAt) {
        desired.paidThroughAt = state.paidThroughAt
      }
      if ((profile.dunningGraceUntil ?? null) !== state.dunningGraceUntil) {
        desired.dunningGraceUntil = state.dunningGraceUntil
      }
    }

    if (Object.keys(desired).length > 0) {
      updates.push({
        profileId: profile.id,
        email,
        changes: desired,
        reason: profile.stripeCustomerId ? 'DRIFTED' : 'RELINKABLE',
      })
    }
  }

  // ---- Report --------------------------------------------------------------
  console.log(`Scanned ${scanned} Stripe customer(s)\n`)

  const relinkable = updates.filter((u) => u.reason === 'RELINKABLE')
  const drifted = updates.filter((u) => u.reason === 'DRIFTED')

  console.log(`RELINKABLE : ${relinkable.length}`)
  console.log(`DRIFTED    : ${drifted.length}`)
  console.log(`ORPHANED   : ${orphaned.length}`)
  console.log(`DUPLICATE  : ${duplicates.size}`)
  if (historicalOrphans > 0) {
    // Counted, not warned about: closed records with no profile need no action.
    console.log(`(${historicalOrphans} ended subscription(s) with no profile — historical, no action)`)
  }
  console.log('')

  for (const update of updates) {
    console.log(`  [${update.reason}] profile ${update.profileId} <${update.email}>`)
    console.log(`      ${JSON.stringify(update.changes)}`)
  }

  if (orphaned.length > 0) {
    console.log(
      `\n⚠️  ${orphaned.length} Stripe customer(s) have a subscription but NO visitor profile.`
    )
    console.log('   This is what destroyed profile rows look like. Resolve by hand:')
    console.log('   the visitor must sign in (creating an auth user + profile), then re-run')
    console.log('   this script to re-link them.\n')
    for (const row of orphaned) {
      console.log(`  [ORPHANED] ${row.customerId} <${row.email}> subscription=${row.status}`)
    }
  }

  if (duplicates.size > 0) {
    console.log(`\n⚠️  ${duplicates.size} email(s) map to multiple Stripe customers:`)
    for (const [email, ids] of duplicates) {
      console.log(`  [DUPLICATE] <${email}> ${ids.join(', ')}`)
    }
    console.log('   Merge these in the Stripe dashboard; this script will not do it.\n')
  }

  // ---- Apply ---------------------------------------------------------------
  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write these changes.')
    return
  }

  let applied = 0
  for (const update of updates) {
    await payload.update({
      collection: 'visitor-profiles',
      id: update.profileId,
      data: update.changes,
      overrideAccess: true,
    })
    applied += 1
  }

  console.log(`\n✅ Applied ${applied} profile update(s).`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Reconciliation failed:', error)
    process.exit(1)
  })
