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
 *   RELINKABLE  A Stripe customer that names its owner in
 *               `metadata.visitorAuthUserId`, whose profile still exists but
 *               has lost its `stripeCustomerId`. Repairable here.
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
 *   UNPROVEN    A Stripe customer whose email matches profiles, but which does
 *               not name any of them as its owner. NOT repairable here: email
 *               alone never proves ownership (see `customer-linkage.ts`), and
 *               adopting on an email match would hand a stranger the payer's
 *               billing portal and membership. Reported for hand resolution.
 *   MISMATCHED  A profile already carries this `stripeCustomerId`, but Stripe
 *               names a different owner. A bad link already exists; it is
 *               reported and skipped rather than written to.
 *
 * Safety
 * ------
 * Dry-run by default: prints the plan and writes nothing. Pass `--apply` to
 * write. It only ever fills in or corrects linkage on existing profiles; it
 * never creates, deletes, or reassigns a profile, and never writes to Stripe.
 *
 * The plan is never written as read. The scan takes minutes, webhooks keep
 * arriving during it, and a plan applied verbatim makes the older reading win
 * purely by writing last — restoring access to a visitor refunded mid-scan, or
 * burying a membership bought mid-scan. So `--apply` treats the plan as a list
 * of rows worth revisiting and re-derives each one under the webhook's own
 * advisory lock. `src/features/payments/lib/reconcile-apply.ts` owns that pass.
 *
 * Ownership is proven by `metadata.visitorAuthUserId` — never by email. The
 * rule itself lives in `src/features/payments/lib/reconcile-ownership.ts` so it
 * is shared with its tests and cannot drift from the checkout path.
 *
 * Which of a customer's subscriptions a profile mirrors is decided by
 * `selectProfileSubscription` (`customer-linkage.ts`) — the billing one, and
 * only the newest when none is billing — the same rule `ownsProfileRow` applies
 * on the webhook path.
 *
 * `--max-apply N` caps the blast radius. If the plan is larger than the cap the
 * plan is printed and nothing is written, because mass drift means something
 * systemic — wrong Stripe key, wrong account, a bad deploy — rather than N
 * genuine divergences. The nightly job runs with a cap for exactly that reason.
 *
 * Usage:
 *   pnpm exec tsx scripts/reconcile-stripe-visitor-profiles.ts
 *   pnpm exec tsx scripts/reconcile-stripe-visitor-profiles.ts --apply
 *   pnpm exec tsx scripts/reconcile-stripe-visitor-profiles.ts --apply --limit 50
 *   pnpm exec tsx scripts/reconcile-stripe-visitor-profiles.ts --apply --max-apply 25
 *
 * Also callable as `run(options)` by `scripts/nightly-stripe-reconcile.ts`.
 */

import 'dotenv/config'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import Stripe from 'stripe'

import { STRIPE_API_VERSION } from '../src/features/payments/lib/stripe-api-version'
import config from '../src/payload.config'
import { selectProfileSubscription } from '../src/features/payments/lib/customer-linkage'
import { deriveSubscriptionState } from '../src/features/payments/lib/subscription-state'
import {
  exceedsApplyCap,
  type ReconcileStepResult,
} from '../src/features/payments/lib/reconcile-report'
import {
  applyPlan,
  diffProfileAgainst,
  type ApplyDeps,
  type PlannedUpdate,
  type ProfileSnapshot,
} from '../src/features/payments/lib/reconcile-apply'
import { withAdvisoryLock } from '../src/shared/utils/advisory-lock'
import {
  normalizeAuthUserId,
  resolveReconcileTarget,
} from '../src/features/payments/lib/reconcile-ownership'
import { isLiveSubscription } from '../src/features/payments/lib/customer-linkage'

export type ReconcileProfilesOptions = {
  apply?: boolean
  /** Stop after this many Stripe customers. `null` walks all of them. */
  limit?: number | null
  /** Refuse to write a plan larger than this. `null` disables the cap. */
  maxApply?: number | null
  /** Called as each line is produced, so a CLI run still streams. */
  onLine?: (line: string) => void
}

/** Reads a positive-integer flag value from `argv`, or null when absent. */
function parsePositiveFlag(flag: string): number | null {
  const index = process.argv.indexOf(flag)
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

/**
 * Stripe's own next retry time, which the dunning grace is derived from. It
 * lives on the latest invoice, so both the scan and the apply pass have to
 * expand it -- an unexpanded id yields no retry time and a shorter grace.
 */
function nextPaymentAttemptOf(subscription: Stripe.Subscription): number | null {
  const invoice = subscription.latest_invoice

  return invoice && typeof invoice !== 'string' ? (invoice.next_payment_attempt ?? null) : null
}

export async function run(options: ReconcileProfilesOptions = {}): Promise<ReconcileStepResult> {
  const apply = options.apply ?? false
  const limit = options.limit ?? null
  const maxApply = options.maxApply ?? null

  const lines: string[] = []
  const emit = (line: string) => {
    lines.push(line)
    options.onLine?.(line)
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required to reconcile against Stripe')
  }

  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, typescript: true })
  const payload = await getPayload({ config })

  emit(apply ? '⚠️  APPLY mode — profiles will be written' : '🔍 Dry run — nothing will be written')

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
  // The ownership index. `metadata.visitorAuthUserId` on the Stripe customer is
  // matched against this, and nothing else decides who a customer belongs to.
  const byAuthUserId = new Map<string, (typeof profiles.docs)[number]>()

  for (const profile of profiles.docs) {
    const email = normalizeEmail(profile.email as string)
    if (email) {
      const bucket = byEmail.get(email) ?? []
      bucket.push(profile)
      byEmail.set(email, bucket)
    }
    const customerId = profile.stripeCustomerId as string | null
    if (customerId) byCustomerId.set(customerId, profile)
    const authUserId = normalizeAuthUserId(profile.authUserId as string | null)
    if (authUserId) byAuthUserId.set(authUserId, profile)
  }

  emit(`Loaded ${profiles.docs.length} visitor profile(s)\n`)

  // ---- Walk Stripe customers ----------------------------------------------
  const updates: PlannedUpdate[] = []
  const orphaned: Array<{ customerId: string; email: string; status: string }> = []
  let historicalOrphans = 0
  const duplicates = new Map<string, string[]>()
  const seenEmails = new Map<string, string[]>()

  /**
   * Customers Stripe is billing more than once.
   *
   * `collapseDuplicateSubscriptions` (checkout webhook) refunds and cancels the
   * extras the moment a duplicate checkout completes, and logs an error when it
   * does — but a log line on one host is not a thing anyone reads, and the
   * collapse only runs if that webhook arrived at all. This is the standing
   * check: whatever the cause, a customer holding two live subscriptions is
   * being charged twice, so it escalates the nightly rather than waiting to be
   * noticed on a statement.
   */
  const multiLive: Array<{ customerId: string; email: string; subscriptionIds: string[] }> = []

  const unproven: Array<{ customerId: string; email: string; status: string | null }> = []
  const mismatched: Array<{
    customerId: string
    email: string
    profileId: string | number
    owner: string
  }> = []

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

    // Every subscription, not just the newest: which one owns the profile row
    // is an ownership question, and `selectProfileSubscription` answers it with
    // the same rule the webhook path enforces (`ownsProfileRow`). Reading only
    // the newest made a ~23h `incomplete` from an abandoned 3DS attempt
    // outrank the membership actually billing, and this script writes what it
    // reads.
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 100,
      // The dunning grace is derived from Stripe's own next retry time, which
      // lives on the invoice.
      expand: ['data.latest_invoice'],
    })
    const subscription = selectProfileSubscription(subscriptions.data)

    const live = subscriptions.data.filter(isLiveSubscription)
    if (live.length > 1) {
      multiLive.push({
        customerId: customer.id,
        email,
        subscriptionIds: live.map((candidate) => candidate.id),
      })
    }

    const owner = normalizeAuthUserId(customer.metadata?.visitorAuthUserId)
    const candidates = byEmail.get(email) ?? []

    const target = resolveReconcileTarget({
      customerOwnerAuthUserId: owner,
      linkedProfile: byCustomerId.get(customer.id),
      ownedProfile: owner ? byAuthUserId.get(owner) : null,
      emailCandidateCount: candidates.length,
    })

    if (target.kind === 'mismatched') {
      mismatched.push({
        customerId: customer.id,
        email,
        profileId: target.profile.id,
        owner: owner ?? '',
      })
      continue
    }

    if (target.kind === 'unproven') {
      // The old code adopted this case on the strength of the shared email.
      // It is reported instead: an email match is a lead for a human, never a
      // licence to hand over someone's billing portal and membership.
      unproven.push({ customerId: customer.id, email, status: subscription?.status ?? null })
      continue
    }

    if (target.kind === 'none') {
      if (subscriptions.data.length > 0) {
        // Only a subscription that could still grant access is a problem. A
        // customer whose subscription ended and whose profile is gone is
        // history: there is nothing to repair and nothing to grant, so warning
        // about it every run trains people to ignore the warning.
        //
        // Asked of the whole list rather than of the selected one: the question
        // here is "is anyone paying with no account to grant it to", which any
        // grantable subscription answers, not just the one that would own a row
        // that does not exist.
        const grantable = subscriptions.data.find((candidate) =>
          LIVE_SUBSCRIPTION_STATUSES.has(candidate.status)
        )

        if (grantable) {
          orphaned.push({ customerId: customer.id, email, status: grantable.status })
        } else {
          historicalOrphans += 1
        }
      }
      continue
    }

    const profile = target.profile

    // Reuse the webhook's own derivation rather than restating it, so a
    // reconciliation run and a live resync cannot disagree about what a
    // Stripe subscription means. This previously read `current_period_end`
    // off the subscription root, which the SDK's API version does not
    // populate, and restated the paid-access rule by hand.
    const state = subscription
      ? deriveSubscriptionState(subscription, {
          previousDunningGraceUntil: profile.dunningGraceUntil,
          nextPaymentAttempt: nextPaymentAttemptOf(subscription),
        })
      : null

    // What the scan saw, for the report and for deciding which rows are worth
    // revisiting. It is NOT what gets written: by the time the apply pass runs
    // this reading is minutes old, so it re-derives under a lock instead. See
    // `reconcile-apply.ts`.
    const changes = diffProfileAgainst(profile as ProfileSnapshot, {
      customerId: customer.id,
      subscriptionId: subscription?.id ?? null,
      state,
    })

    if (Object.keys(changes).length > 0) {
      updates.push({
        profileId: profile.id,
        email,
        changes,
        reason: profile.stripeCustomerId ? 'DRIFTED' : 'RELINKABLE',
        customerId: customer.id,
        subscriptionId: subscription?.id ?? null,
        // Compare-and-swap token: the apply pass abandons the row if this moved.
        updatedAt: (profile.updatedAt as string | null) ?? null,
      })
    }
  }

  // ---- Report --------------------------------------------------------------
  emit(`Scanned ${scanned} Stripe customer(s)\n`)

  const relinkable = updates.filter((u) => u.reason === 'RELINKABLE')
  const drifted = updates.filter((u) => u.reason === 'DRIFTED')

  emit(`RELINKABLE : ${relinkable.length}`)
  emit(`DRIFTED    : ${drifted.length}`)
  emit(`ORPHANED   : ${orphaned.length}`)
  emit(`DUPLICATE  : ${duplicates.size}`)
  emit(`UNPROVEN   : ${unproven.length}`)
  emit(`MISMATCHED : ${mismatched.length}`)
  emit(`MULTI_LIVE : ${multiLive.length}`)
  if (historicalOrphans > 0) {
    // Counted, not warned about: closed records with no profile need no action.
    emit(`(${historicalOrphans} ended subscription(s) with no profile — historical, no action)`)
  }
  emit('')

  for (const update of updates) {
    emit(`  [${update.reason}] profile ${update.profileId} <${update.email}>`)
    emit(`      ${JSON.stringify(update.changes)}`)
  }

  if (orphaned.length > 0) {
    emit(`\n⚠️  ${orphaned.length} Stripe customer(s) have a subscription but NO visitor profile.`)
    emit('   This is what destroyed profile rows look like. Resolve by hand:')
    emit('   the visitor signs in (creating an auth user + profile), then set')
    emit('   metadata.visitorAuthUserId on the customer in Stripe to that auth user')
    emit('   — signing in alone does not prove who paid — and re-run this script.\n')
    for (const row of orphaned) {
      emit(`  [ORPHANED] ${row.customerId} <${row.email}> subscription=${row.status}`)
    }
  }

  if (unproven.length > 0) {
    emit(`\n⚠️  ${unproven.length} Stripe customer(s) match a profile by email only.`)
    emit('   Email is not ownership: a customer keeps the address it was created')
    emit('   with, and this account also holds customers made by hand. Nothing was')
    emit('   written. Confirm the payer by hand, then set')
    emit('   metadata.visitorAuthUserId on the customer in Stripe and re-run.\n')
    for (const row of unproven) {
      emit(
        `  [UNPROVEN] ${row.customerId} <${row.email}> subscription=${row.status ?? 'none'}`
      )
    }
  }

  if (mismatched.length > 0) {
    emit(`\n⛔ ${mismatched.length} profile(s) hold a Stripe customer that names another owner.`)
    emit('   A wrong linkage already exists. Nothing was written to these profiles;')
    emit('   resolve the ownership by hand before this run can heal them.\n')
    for (const row of mismatched) {
      emit(
        `  [MISMATCHED] ${row.customerId} <${row.email}> profile=${row.profileId} stripe_owner=${row.owner}`
      )
    }
  }

  if (multiLive.length > 0) {
    emit(`\n⛔ ${multiLive.length} Stripe customer(s) hold more than one live subscription.`)
    emit('   They are being billed twice. Nothing is cancelled here: which one to')
    emit('   keep decides who gets refunded, so it is a human call. Keep the one')
    emit('   that collected, refund and cancel the rest in Stripe, then re-run.\n')
    for (const row of multiLive) {
      emit(`  [MULTI_LIVE] ${row.customerId} <${row.email}> ${row.subscriptionIds.join(', ')}`)
    }
  }

  if (duplicates.size > 0) {
    emit(`\n⚠️  ${duplicates.size} email(s) map to multiple Stripe customers:`)
    for (const [email, ids] of duplicates) {
      emit(`  [DUPLICATE] <${email}> ${ids.join(', ')}`)
    }
    emit('   Merge these in the Stripe dashboard; this script will not do it.\n')
  }

  const baseCounts = {
    scanned,
    profiles: profiles.docs.length,
    relinkable: relinkable.length,
    drifted: drifted.length,
    orphaned: orphaned.length,
    duplicate: duplicates.size,
    unproven: unproven.length,
    mismatched: mismatched.length,
    multi_live: multiLive.length,
    historical: historicalOrphans,
  }

  // ---- Blast-radius cap ----------------------------------------------------
  // Checked in dry run as well as apply. The cap is a statement about the plan,
  // not about the write: a plan this large is a finding either way, and the
  // pre-adoption dry run is where it should be caught.
  if (exceedsApplyCap(updates.length, maxApply)) {
    emit(
      `\n⛔ Plan of ${updates.length} update(s) exceeds the cap of ${maxApply}. Nothing was written.`
    )
    emit('   A plan this large means something systemic — wrong Stripe key, wrong')
    emit('   account, or a bad deploy — rather than that many genuine divergences.')
    emit('   Review the plan above, then re-run with a deliberate --max-apply.')
    return {
      ok: false,
      reason: 'cap-exceeded',
      counts: { ...baseCounts, applied: 0, planned: updates.length },
      lines,
    }
  }

  // ---- Apply ---------------------------------------------------------------
  if (!apply) {
    emit('\nDry run complete. Re-run with --apply to write these changes.')
    return {
      // ORPHANED and DUPLICATE are real findings but are not this script's to
      // repair, so they do not make the run itself a failure. The nightly
      // escalates them from the counts.
      ok: true,
      counts: { ...baseCounts, applied: 0, planned: updates.length },
      lines,
    }
  }

  // Every write re-reads the profile and re-reads Stripe, under the same lock
  // the webhook path takes. The plan above is a list of rows worth revisiting,
  // never the values to write -- see the header of `reconcile-apply.ts` for the
  // two ways writing it verbatim corrupts live membership state.
  const deps: ApplyDeps = {
    emit,

    readProfile: async (profileId) => {
      const doc = await payload.findByID({
        collection: 'visitor-profiles',
        id: profileId,
        depth: 0,
        overrideAccess: true,
        // A row deleted between the scan and now is a skip, not a throw.
        disableErrors: true,
      })

      return (doc as ProfileSnapshot | null) ?? null
    },

    readDesired: async (customerId, profile) => {
      const customer = await stripe.customers.retrieve(customerId)
      if (customer.deleted) return null

      // Ownership is re-proven, not assumed to have survived the scan. It is
      // the same rule the scan applied: `metadata.visitorAuthUserId`, never
      // email.
      const owner = normalizeAuthUserId(customer.metadata?.visitorAuthUserId)
      if (!owner || owner !== normalizeAuthUserId(profile.authUserId ?? null)) return null

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
        expand: ['data.latest_invoice'],
      })

      // Re-selected, not refetched by id: a checkout during the scan can make a
      // different subscription the one this row mirrors.
      const subscription = selectProfileSubscription(subscriptions.data)

      return {
        customerId,
        subscriptionId: subscription?.id ?? null,
        state: subscription
          ? deriveSubscriptionState(subscription, {
              previousDunningGraceUntil: profile.dunningGraceUntil,
              nextPaymentAttempt: nextPaymentAttemptOf(subscription),
            })
          : null,
      }
    },

    writeProfile: async (profileId, changes) => {
      await payload.update({
        collection: 'visitor-profiles',
        id: profileId,
        data: changes,
        overrideAccess: true,
      })
    },

    withLock: (key, work) => withAdvisoryLock(payload, key, work),
  }

  const summary = await applyPlan(updates, deps)
  const skipped = summary.stale + summary.noop + summary.missing

  emit(`\n✅ Applied ${summary.applied} profile update(s).`)
  if (skipped > 0) {
    emit(
      `↷ ${skipped} planned update(s) skipped as out of date (${summary.stale} changed under the scan, ${summary.noop} already in sync, ${summary.missing} no longer resolvable).`
    )
  }
  if (summary.failed > 0) emit(`⛔ ${summary.failed} update(s) could not be written.`)

  return {
    ok: summary.failed === 0,
    reason: summary.failed > 0 ? 'apply-failed' : undefined,
    counts: {
      ...baseCounts,
      applied: summary.applied,
      planned: updates.length,
      apply_failed: summary.failed,
      // Skips are the guard working, not a finding: `ESCALATING_COUNTS` does
      // not list them, so they inform the report without paging anyone.
      skipped_stale: summary.stale,
      skipped_noop: summary.noop,
      skipped_missing: summary.missing,
    },
    lines,
  }
}

// Unchanged CLI: same flags, same streamed report, and — as before — exit 0 on
// any completed run. ORPHANED/DUPLICATE were never a non-zero CLI exit and are
// not made one here; the nightly is what escalates them.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({
    apply: process.argv.includes('--apply'),
    limit: parsePositiveFlag('--limit'),
    maxApply: parsePositiveFlag('--max-apply'),
    onLine: (line) => console.log(line),
  })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Reconciliation failed:', error)
      process.exit(1)
    })
}
