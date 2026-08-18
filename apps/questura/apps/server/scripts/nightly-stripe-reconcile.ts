/**
 * Nightly Stripe ↔ visitor_profiles reconciliation
 *
 * Why this exists
 * ---------------
 * Webhooks are the only thing that writes membership state, and nothing
 * verifies that what Stripe believes and what `visitor_profiles` believes still
 * agree. A webhook that is never delivered — or is delivered, returns 2xx, and
 * then fails to write — leaves a divergence that Stripe stops retrying after
 * about three days. After that the divergence is permanent and silent:
 * paid-but-no-access, refunded-but-still-access, cancelled-but-still-access.
 *
 * Three scripts already detect and repair exactly this, and all three were
 * manual. This composes them into one scheduled run.
 *
 * This file is the portable half. It runs anywhere Node runs, so the same
 * command is what a serverless deployment points Vercel Cron / EventBridge / a
 * GitHub Actions schedule at. The systemd timer and `infra/softprod/reconcile.sh`
 * that drive it on the Linux laptop are throwaway glue and are deleted at
 * migration; nothing in this file knows about them.
 *
 * Order matters
 * -------------
 * 1. `verify-stripe-webhook-events` — cheapest, and catches the whole
 *    config-drift class (endpoint missing events, endpoint disabled) before
 *    anything else runs or writes.
 * 2. `reconcile-stripe-visitor-profiles` — with apply and a blast-radius cap.
 * 3. `audit-access-revocations` — read-only. Each row is a decision about
 *    somebody's money and stays manual by design; do not add an apply mode.
 * 4. `prune-stripe-webhook-events` — drop processed webhook rows older than
 *    30 days. Last so a prune failure cannot hide billing drift. Respects
 *    `QUESTURA_RECONCILE_APPLY`: dry-run counts, apply deletes.
 *
 * All four run even if an earlier one fails, because the value is in the whole
 * picture and a Stripe outage in step one should not hide drift in step two.
 * The exit code is aggregated by `reconcile-report.ts`.
 *
 * Exit codes
 * ----------
 *   0  All clear, or drift was found and successfully auto-applied.
 *   1  A human is needed. See `reconcile-report.ts` for the rule.
 *
 * Env knobs
 * ---------
 *   QUESTURA_RECONCILE_APPLY       `0` to make the whole run read-only. Default `1`.
 *   QUESTURA_RECONCILE_MAX_APPLY   Refuse to write a plan larger than this. Default `25`.
 *
 * Usage:
 *   pnpm reconcile:nightly
 *   QUESTURA_RECONCILE_APPLY=0 pnpm reconcile:nightly     # dry run, writes nothing
 */

import 'dotenv/config'

import {
  buildReconcileReport,
  type ReconcileStepName,
  type ReconcileStepReport,
} from '../src/features/payments/lib/reconcile-report'
import { run as runAuditRevocations } from './audit-access-revocations'
import { run as runPruneWebhookEvents } from './prune-stripe-webhook-events'
import { run as runReconcileProfiles } from './reconcile-stripe-visitor-profiles'
import { run as runVerifyWebhookEvents } from './verify-stripe-webhook-events'

const DEFAULT_MAX_APPLY = 25

function readApply(): boolean {
  // Anything other than an explicit `0` applies. A typo must not silently
  // downgrade the nightly to a dry run nobody reads.
  return (process.env.QUESTURA_RECONCILE_APPLY ?? '1').trim() !== '0'
}

function readMaxApply(): number {
  const raw = process.env.QUESTURA_RECONCILE_MAX_APPLY
  if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_APPLY
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `QUESTURA_RECONCILE_MAX_APPLY must be a positive integer, got: ${JSON.stringify(raw)}`
    )
  }
  return value
}

/**
 * Runs one step, converting a throw into a reportable result.
 *
 * A step's own `ok` flag is deliberately not consulted: every signal it encodes
 * is also present in `counts` and `reason`, and having one place decide is what
 * makes the exit rule testable.
 */
async function runStep(
  step: ReconcileStepName,
  execute: () => Promise<{ counts: Record<string, number>; lines: string[]; reason?: string }>
): Promise<ReconcileStepReport> {
  try {
    const result = await execute()
    return { step, counts: result.counts, reason: result.reason, lines: result.lines }
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    return { step, threw: true, reason: 'threw', lines: [`THREW: ${message}`] }
  }
}

async function main(): Promise<number> {
  const apply = readApply()
  const maxApply = readMaxApply()

  const reports: ReconcileStepReport[] = []

  reports.push(await runStep('verify', () => runVerifyWebhookEvents()))
  reports.push(await runStep('profiles', () => runReconcileProfiles({ apply, maxApply })))
  reports.push(await runStep('audit', () => runAuditRevocations()))
  reports.push(await runStep('retention', () => runPruneWebhookEvents({ apply })))

  const report = buildReconcileReport(reports, { apply, maxApply })
  for (const line of report.lines) console.log(line)

  return report.exitCode
}

main()
  .then((exitCode) => process.exit(exitCode))
  .catch((error) => {
    // Only a failure outside the steps reaches here — a bad env knob, or
    // the report builder itself. A step that throws is reported, not fatal.
    console.error(
      'RECONCILE result=error exit=1 reason=orchestrator-failed',
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  })
