/**
 * Nightly reconciliation: the write half
 *
 * Why this exists
 * ---------------
 * `scripts/reconcile-stripe-visitor-profiles.ts` works in two phases. It reads
 * every Stripe customer and builds a plan (minutes of network walk), then it
 * writes that plan. Between the two, webhooks keep arriving.
 *
 * Applying the plan as-read makes the *older* reading win, because it is simply
 * the one that writes last:
 *
 *   04:22 scan reads subscription: clean, paid through Mar 1
 *   04:31 charge.refunded lands, revokes access, sets paidThroughAt = null
 *   04:40 plan is applied: paidThroughAt = Mar 1 -- refunded visitor has access
 *
 * and the mirror image, where a visitor who checks out at 04:25 gets their old
 * cancelled subscription written back over a live membership. `--max-apply`
 * bounds how many rows that can hit; it says nothing about whether they are
 * right.
 *
 * So the plan is treated as a *list of rows worth revisiting*, never as the
 * values to write. Every write re-derives from scratch:
 *
 *   1. Under the same advisory lock the webhook path uses
 *      (`stripe:subscription:${id}`, see `subscription-resync.ts`), so a resync
 *      cannot interleave with this at all.
 *   2. Re-reading the profile, and abandoning the row if it changed since the
 *      scan saw it -- a compare-and-swap on `updatedAt`. This is what covers
 *      the rows with no subscription to lock on.
 *   3. Re-reading Stripe, including which subscription owns the row. The
 *      revocation flag lives in subscription metadata, so a fresh read is the
 *      only thing that can see a refund the scan snapshot predates.
 *
 * The diff itself is shared with the scan phase (`diffProfileAgainst`) so the
 * plan and the write cannot disagree about what a divergence is.
 *
 * Dependencies are injected rather than imported: the script owns the Stripe
 * client and the Payload instance, and this file has to stay testable under
 * `vitest`, which only collects `src/`.
 */

import type { DerivedSubscriptionState } from './subscription-state'

/** The profile fields reconciliation reads and writes. */
export type ProfileSnapshot = {
  id: string | number
  updatedAt?: string | null
  authUserId?: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  subscriptionStatus?: string | null
  cancelAtPeriodEnd?: boolean | null
  paidThroughAt?: string | null
  dunningGraceUntil?: string | null
}

/** What a fresh Stripe read says a profile should mirror. */
export type DesiredProfileState = {
  customerId: string
  /** Null when the customer has no subscription to mirror at all. */
  subscriptionId: string | null
  state: DerivedSubscriptionState | null
}

export type PlannedUpdate = {
  profileId: string | number
  email: string
  changes: Record<string, unknown>
  reason: 'RELINKABLE' | 'DRIFTED'
  customerId: string
  /**
   * Lock key, and the subscription the scan decided owns this row. Null when
   * the plan is customer linkage only.
   */
  subscriptionId: string | null
  /** Compare-and-swap token, captured when the scan read the profile. */
  updatedAt: string | null
}

export type ApplyOutcome =
  | 'applied'
  /** The profile moved under us, or a different subscription now owns it. */
  | 'stale'
  /** Nothing left to write: something else already healed it. */
  | 'noop'
  /** The profile is gone, or the Stripe customer is gone or no longer owned. */
  | 'missing'
  | 'failed'

export type ApplyDeps = {
  /** Re-read the profile inside the lock. Null when the row is gone. */
  readProfile: (profileId: string | number) => Promise<ProfileSnapshot | null>
  /**
   * Re-read Stripe for this customer and re-derive. Must re-select which
   * subscription owns the row (`selectProfileSubscription`), not just refetch
   * the one the scan picked. Null when the customer is gone.
   */
  readDesired: (customerId: string, profile: ProfileSnapshot) => Promise<DesiredProfileState | null>
  writeProfile: (profileId: string | number, changes: Record<string, unknown>) => Promise<void>
  /** Runs `work` under the given advisory lock key. */
  withLock: <T>(key: string, work: () => Promise<T>) => Promise<T>
  emit: (line: string) => void
}

export type ApplySummary = {
  applied: number
  stale: number
  noop: number
  missing: number
  failed: number
}

/**
 * The one definition of "this profile disagrees with Stripe", used by the scan
 * to plan and by the apply pass to write. Returns only the fields that differ,
 * so a row healed between the two phases writes nothing.
 */
export function diffProfileAgainst(
  profile: ProfileSnapshot,
  desired: DesiredProfileState
): Record<string, unknown> {
  const changes: Record<string, unknown> = {}

  if (!profile.stripeCustomerId) {
    changes.stripeCustomerId = desired.customerId
  }

  const { state, subscriptionId } = desired

  if (state && subscriptionId) {
    if (profile.stripeSubscriptionId !== subscriptionId) {
      changes.stripeSubscriptionId = subscriptionId
    }
    if (profile.subscriptionStatus !== state.subscriptionStatus) {
      changes.subscriptionStatus = state.subscriptionStatus
    }
    if (Boolean(profile.cancelAtPeriodEnd) !== state.cancelAtPeriodEnd) {
      changes.cancelAtPeriodEnd = state.cancelAtPeriodEnd
    }
    if ((profile.paidThroughAt ?? null) !== state.paidThroughAt) {
      changes.paidThroughAt = state.paidThroughAt
    }
    if ((profile.dunningGraceUntil ?? null) !== state.dunningGraceUntil) {
      changes.dunningGraceUntil = state.dunningGraceUntil
    }
  }

  return changes
}

/**
 * Whether the profile changed since the scan read it.
 *
 * A missing token on either side is treated as movement: without a timestamp
 * to compare there is no evidence the row is unchanged, and the safe reading of
 * "unknown" is to leave the row for the next run rather than overwrite it.
 */
function movedSinceScan(scanned: string | null, current: string | null | undefined): boolean {
  if (!scanned || !current) return true

  return scanned !== current
}

/**
 * Apply one planned row, re-deriving everything inside the lock.
 *
 * The plan's own `changes` are deliberately never written: they are a snapshot
 * of a Stripe read that is minutes old by the time this runs.
 */
export async function applyPlannedUpdate(
  update: PlannedUpdate,
  deps: ApplyDeps
): Promise<ApplyOutcome> {
  const work = async (): Promise<ApplyOutcome> => {
    const profile = await deps.readProfile(update.profileId)

    if (!profile) {
      deps.emit(`  ↷ SKIPPED profile ${update.profileId} <${update.email}>: profile no longer exists`)
      return 'missing'
    }

    if (movedSinceScan(update.updatedAt, profile.updatedAt)) {
      deps.emit(
        `  ↷ SKIPPED profile ${update.profileId} <${update.email}>: changed since the scan read it`
      )
      return 'stale'
    }

    const desired = await deps.readDesired(update.customerId, profile)

    if (!desired) {
      deps.emit(
        `  ↷ SKIPPED profile ${update.profileId} <${update.email}>: Stripe customer ${update.customerId} is gone or no longer names this profile as its owner`
      )
      return 'missing'
    }

    // Which subscription owns the row is itself a thing that can change under
    // us -- a checkout mid-scan makes a new one the owner. If the fresh read
    // disagrees with the plan, a webhook has already handled this row.
    if (desired.subscriptionId !== update.subscriptionId) {
      deps.emit(
        `  ↷ SKIPPED profile ${update.profileId} <${update.email}>: owning subscription changed since the scan (${update.subscriptionId ?? 'none'} → ${desired.subscriptionId ?? 'none'})`
      )
      return 'stale'
    }

    const changes = diffProfileAgainst(profile, desired)

    if (Object.keys(changes).length === 0) {
      deps.emit(`  ↷ SKIPPED profile ${update.profileId} <${update.email}>: already in sync`)
      return 'noop'
    }

    await deps.writeProfile(update.profileId, changes)
    return 'applied'
  }

  try {
    // No subscription means no key the webhook path would ever contend on, so
    // there is nothing to serialise against and the `updatedAt` check above is
    // the whole guard for those rows.
    return update.subscriptionId
      ? await deps.withLock(`stripe:subscription:${update.subscriptionId}`, work)
      : await work()
  } catch (error) {
    // One unwritable row must not hide the rest of the plan from the report.
    deps.emit(
      `  ⛔ FAILED profile ${update.profileId} <${update.email}>: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return 'failed'
  }
}

/** Apply every planned row, one at a time, and tally the outcomes. */
export async function applyPlan(
  updates: PlannedUpdate[],
  deps: ApplyDeps
): Promise<ApplySummary> {
  const summary: ApplySummary = { applied: 0, stale: 0, noop: 0, missing: 0, failed: 0 }

  for (const update of updates) {
    summary[await applyPlannedUpdate(update, deps)] += 1
  }

  return summary
}
