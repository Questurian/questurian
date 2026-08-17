import { describe, expect, it } from 'vitest'

import {
  buildReconcileReport,
  classifyStep,
  exceedsApplyCap,
  type ReconcileStepReport,
} from './reconcile-report'

/**
 * The point of these tests is the exit rule, not the wording. The rule is the
 * only thing standing between "drift was healed, go back to sleep" and "someone
 * has been paying for nothing since Tuesday", and it is the one part of the
 * nightly that can be exercised without touching live Stripe.
 */

const CLEAN_VERIFY = { endpoints: 1, missing: 0, disabled: 0, extra: 0 }
const CLEAN_PROFILES = {
  scanned: 12,
  profiles: 9,
  relinkable: 0,
  drifted: 0,
  applied: 0,
  planned: 0,
  orphaned: 0,
  duplicate: 0,
  ambiguous: 0,
  historical: 0,
}
const CLEAN_AUDIT = {
  scanned: 12,
  profiles: 9,
  stuck: 0,
  unknown: 0,
  in_period: 0,
  contested: 0,
  closed: 0,
}

function reports(overrides: Partial<Record<'verify' | 'profiles' | 'audit', ReconcileStepReport>> = {}) {
  return [
    overrides.verify ?? { step: 'verify' as const, counts: CLEAN_VERIFY, lines: [] },
    overrides.profiles ?? { step: 'profiles' as const, counts: CLEAN_PROFILES, lines: [] },
    overrides.audit ?? { step: 'audit' as const, counts: CLEAN_AUDIT, lines: [] },
  ]
}

const OPTIONS = { apply: true, maxApply: 25 }

describe('buildReconcileReport exit code', () => {
  it('exits 0 when all three steps are clean', () => {
    const report = buildReconcileReport(reports(), OPTIONS)
    expect(report.exitCode).toBe(0)
    expect(report.summaryLine).toContain('result=ok')
    expect(report.summaryLine).toContain('escalations=none')
  })

  it('exits 0 when drift was found and successfully applied', () => {
    const report = buildReconcileReport(
      reports({
        profiles: {
          step: 'profiles',
          counts: { ...CLEAN_PROFILES, relinkable: 1, drifted: 3, planned: 4, applied: 4 },
          lines: [],
        },
      }),
      OPTIONS
    )

    // Healed drift is the job working. Escalating it would train whoever reads
    // the report to ignore it, which is the failure mode this replaced.
    expect(report.exitCode).toBe(0)
    expect(report.summaryLine).toContain('drifted=3 applied=4')
  })

  it.each([
    ['missing events on an enabled endpoint', { verify: { missing: 2 } }],
    ['a disabled endpoint', { verify: { disabled: 1 } }],
    ['an orphaned Stripe customer', { profiles: { orphaned: 1 } }],
    ['duplicate Stripe customers for one email', { profiles: { duplicate: 1 } }],
    ['a stuck revocation', { audit: { stuck: 1 } }],
    ['an unclassifiable revocation', { audit: { unknown: 1 } }],
  ])('exits 1 on %s', (_label, overrides: Record<string, Record<string, number>>) => {
    const report = buildReconcileReport(
      reports({
        verify: {
          step: 'verify',
          counts: { ...CLEAN_VERIFY, ...(overrides.verify ?? {}) },
          lines: [],
        },
        profiles: {
          step: 'profiles',
          counts: { ...CLEAN_PROFILES, ...(overrides.profiles ?? {}) },
          lines: [],
        },
        audit: {
          step: 'audit',
          counts: { ...CLEAN_AUDIT, ...(overrides.audit ?? {}) },
          lines: [],
        },
      }),
      OPTIONS
    )

    expect(report.exitCode).toBe(1)
    expect(report.summaryLine).toContain('result=attention')
  })

  it('exits 1 when the blast-radius cap was exceeded, and names the reason first', () => {
    const report = buildReconcileReport(
      reports({
        profiles: {
          step: 'profiles',
          counts: { ...CLEAN_PROFILES, drifted: 40, planned: 40, applied: 0 },
          reason: 'cap-exceeded',
          lines: [],
        },
      }),
      OPTIONS
    )

    expect(report.exitCode).toBe(1)
    expect(report.summaryLine).toContain('escalations=profiles:cap-exceeded')
    // Nothing was written, so the report must not claim otherwise.
    expect(report.summaryLine).toContain('applied=0')
  })

  it('exits 1 when a step threw, and still reports the steps that ran', () => {
    const report = buildReconcileReport(
      reports({
        verify: { step: 'verify', threw: true, reason: 'threw', lines: ['THREW: socket hang up'] },
      }),
      OPTIONS
    )

    expect(report.exitCode).toBe(1)
    expect(report.summaryLine).toContain('verify=error')
    // Still a key=value pair: the line has to stay parseable on the bad night.
    expect(report.summaryLine).toContain('verify_counts=unavailable')
    expect(report.summaryLine).toContain('escalations=verify:threw')
    // The other two ran anyway: a Stripe blip in step one must not hide drift.
    expect(report.summaryLine).toContain('profiles=ok')
    expect(report.summaryLine).toContain('audit=ok')
    expect(report.lines.join('\n')).toContain('socket hang up')
  })

  it('aggregates every escalation rather than reporting only the first', () => {
    const report = buildReconcileReport(
      reports({
        verify: { step: 'verify', counts: { ...CLEAN_VERIFY, missing: 1 }, lines: [] },
        audit: { step: 'audit', counts: { ...CLEAN_AUDIT, stuck: 2, unknown: 1 }, lines: [] },
      }),
      OPTIONS
    )

    expect(report.exitCode).toBe(1)
    expect(report.summaryLine).toContain('escalations=verify:missing,audit:stuck,audit:unknown')
  })

  it('records the apply mode and cap the run actually used', () => {
    const report = buildReconcileReport(reports(), { apply: false, maxApply: 5 })
    expect(report.summaryLine).toContain('apply=0 max_apply=5')
  })

  it('puts the summary first and every step detail after it', () => {
    const report = buildReconcileReport(
      reports({
        audit: { step: 'audit', counts: CLEAN_AUDIT, lines: ['STUCK     : 0'] },
      }),
      OPTIONS
    )

    expect(report.lines[0]).toBe(report.summaryLine)
    expect(report.lines).toContain('--- audit (ok) ---')
    expect(report.lines).toContain('STUCK     : 0')
  })

  it('does not escalate extra events, which are noise rather than a failure', () => {
    const report = buildReconcileReport(
      reports({
        verify: { step: 'verify', counts: { ...CLEAN_VERIFY, extra: 3 }, lines: [] },
      }),
      OPTIONS
    )
    expect(report.exitCode).toBe(0)
  })

  it('reports missing counts as zero rather than failing to render them', () => {
    const report = buildReconcileReport(
      reports({ audit: { step: 'audit', counts: {}, lines: [] } }),
      OPTIONS
    )
    expect(report.exitCode).toBe(0)
    expect(report.summaryLine).toContain('stuck=0 unknown=0')
  })
})

describe('classifyStep', () => {
  it('treats a reason as an escalation even when every count is clean', () => {
    expect(
      classifyStep({ step: 'verify', counts: CLEAN_VERIFY, reason: 'no-endpoint', lines: [] })
    ).toEqual({ status: 'attention', escalations: ['no-endpoint'] })
  })

  it('reports a throw as an error, not merely attention', () => {
    expect(classifyStep({ step: 'audit', threw: true, reason: 'threw', lines: [] }).status).toBe(
      'error'
    )
  })
})

describe('exceedsApplyCap', () => {
  it('allows a plan exactly at the cap', () => {
    expect(exceedsApplyCap(25, 25)).toBe(false)
  })

  it('refuses a plan one over the cap', () => {
    expect(exceedsApplyCap(26, 25)).toBe(true)
  })

  it('allows an empty plan', () => {
    expect(exceedsApplyCap(0, 0)).toBe(false)
  })

  it('has no cap when none is given, which is the manual CLI default', () => {
    expect(exceedsApplyCap(10_000, null)).toBe(false)
  })
})
