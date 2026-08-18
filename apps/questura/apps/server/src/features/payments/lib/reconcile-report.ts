/**
 * Nightly reconciliation: the decision half
 *
 * Why this exists
 * ---------------
 * The nightly job runs four scripts and then has to answer one question: does
 * a human need to look at this tonight? That answer is the whole value of the
 * job — get it wrong in the lenient direction and divergence stays silent; get
 * it wrong in the noisy direction and the report joins the pile of output
 * nobody reads.
 *
 * So the answer is computed here, as a pure function over the step result
 * objects, and nowhere else. It lives in `src/` rather than `scripts/` because
 * `vitest.config.ts` only collects tests under `src/shared`, `src/features`,
 * and `src/app`: putting it here makes the rule testable with no config change.
 *
 * The rule
 * --------
 *   exit 0  All clear, *or* drift was found and successfully auto-applied.
 *           Healed drift is logged, not escalated — that is the job working.
 *   exit 1  A human is needed. Anything the scripts cannot repair themselves:
 *           MISSING events on an enabled endpoint, a DISABLED endpoint,
 *           ORPHANED, DUPLICATE, STUCK, UNKNOWN, the blast-radius cap being
 *           exceeded, or a step that threw.
 */

export type ReconcileStepName = 'verify' | 'profiles' | 'audit' | 'retention'

/**
 * What each script's `run()` hands back. `lines` is the detail report the
 * script would otherwise have printed, so the orchestrator can emit a summary
 * first and the detail after it.
 */
export type ReconcileStepResult = {
  ok: boolean
  counts: Record<string, number>
  lines: string[]
  /** Set when the step could not complete, or completed blocked. */
  reason?: string
}

/** A step as seen by the orchestrator, including the case where it threw. */
export type ReconcileStepReport = {
  step: ReconcileStepName
  /** Absent only when the step threw before producing any counts. */
  counts?: Record<string, number>
  reason?: string
  threw?: boolean
  lines: string[]
}

export type StepStatus = 'ok' | 'attention' | 'error'

/**
 * Counts that mean a human is needed, per step. Everything a script can repair
 * itself is deliberately absent: `relinkable` and `drifted` are what the apply
 * pass exists to fix, so finding them is not an escalation.
 */
export const ESCALATING_COUNTS: Readonly<Record<ReconcileStepName, readonly string[]>> = {
  verify: ['missing', 'disabled'],
  // `unproven` and `mismatched` are ownership questions only a human can
  // answer: an email match is not proof, so the script reports them instead of
  // adopting them, and the nightly must not let that report go unread.
  profiles: ['orphaned', 'duplicate', 'unproven', 'mismatched'],
  audit: ['stuck', 'unknown'],
  // Pruning old webhook rows is the job working. A throw still escalates.
  retention: [],
}

/**
 * Which counts appear on the one-line summary, in a fixed order so the line is
 * stable enough to grep and to diff between nights.
 */
const SUMMARY_COUNTS: Readonly<Record<ReconcileStepName, readonly string[]>> = {
  verify: ['missing', 'disabled', 'extra'],
  profiles: ['relinkable', 'drifted', 'applied', 'orphaned', 'duplicate', 'unproven', 'mismatched'],
  audit: ['stuck', 'unknown', 'in_period', 'contested', 'closed'],
  retention: ['expired', 'deleted'],
}

export type StepClassification = {
  status: StepStatus
  /** Human-readable escalation tags, e.g. `orphaned`, `cap-exceeded`, `threw`. */
  escalations: string[]
}

export function classifyStep(report: ReconcileStepReport): StepClassification {
  if (report.threw) {
    return { status: 'error', escalations: [report.reason ?? 'threw'] }
  }

  const escalations = ESCALATING_COUNTS[report.step].filter(
    (key) => (report.counts?.[key] ?? 0) > 0
  )

  // A reason is the script saying "I stopped short" — a cap it refused to
  // exceed, an endpoint it could not find. Always an escalation, and reported
  // ahead of the counts because it explains them.
  if (report.reason) escalations.unshift(report.reason)

  return { status: escalations.length > 0 ? 'attention' : 'ok', escalations }
}

export type ReconcileReportOptions = {
  apply: boolean
  maxApply: number
}

export type ReconcileReport = {
  exitCode: 0 | 1
  /** One machine-greppable line, printed before the per-script detail. */
  summaryLine: string
  /** The summary line followed by every step's detail, ready to print. */
  lines: string[]
}

function formatCounts(step: ReconcileStepName, counts: Record<string, number> | undefined): string {
  // Keyed even when there is nothing to report: every field on the summary line
  // has to be a `key=value` pair or the line stops being parseable.
  if (!counts) return `${step}_counts=unavailable`
  // Count names are unique across steps, so they need no prefix.
  return SUMMARY_COUNTS[step].map((key) => `${key}=${counts[key] ?? 0}`).join(' ')
}

export function buildReconcileReport(
  reports: readonly ReconcileStepReport[],
  options: ReconcileReportOptions
): ReconcileReport {
  const classified = reports.map((report) => ({ report, ...classifyStep(report) }))

  const escalated = classified.filter((entry) => entry.status !== 'ok')
  const exitCode: 0 | 1 = escalated.length > 0 ? 1 : 0

  const escalations = escalated
    .flatMap((entry) => entry.escalations.map((tag) => `${entry.report.step}:${tag}`))
    .join(',')

  const summaryLine = [
    'RECONCILE',
    `result=${exitCode === 0 ? 'ok' : 'attention'}`,
    `exit=${exitCode}`,
    `apply=${options.apply ? 1 : 0}`,
    `max_apply=${options.maxApply}`,
    ...classified.map((entry) => `${entry.report.step}=${entry.status}`),
    ...classified.map((entry) => formatCounts(entry.report.step, entry.report.counts)),
    `escalations=${escalations || 'none'}`,
  ].join(' ')

  const lines = [summaryLine]
  for (const entry of classified) {
    lines.push('', `--- ${entry.report.step} (${entry.status}) ---`)
    lines.push(...entry.report.lines)
  }

  return { exitCode, summaryLine, lines }
}

/**
 * The blast-radius rule, shared by the reconcile script and its tests. Mass
 * drift means something systemic — wrong Stripe key, wrong account, a bad
 * deploy — not forty genuine divergences, and the nightly must not paper over
 * that by applying them all.
 */
export function exceedsApplyCap(plannedUpdates: number, maxApply: number | null): boolean {
  if (maxApply === null) return false
  return plannedUpdates > maxApply
}
