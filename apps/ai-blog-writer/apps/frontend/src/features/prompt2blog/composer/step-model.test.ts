import { describe, expect, it } from 'vitest'
import limaFixture from '../../../../../../data/fixtures/prompt2blog/lima-scope-drift-v3.json'
import type { Prompt2BlogCommission, Prompt2BlogEvidencePackage } from '../api'
import { DEFAULT_COMPOSER_STATE } from './composer.storage'
import type { P2BFormState } from './composer.types'
import { currentP2BStep, deriveP2BSteps, P2B_STEP_IDS } from './step-model'

const commission = limaFixture.commission as unknown as Prompt2BlogCommission
const evidencePackage = limaFixture.evidence_package as unknown as Prompt2BlogEvidencePackage

function state(overrides: Partial<P2BFormState> = {}): P2BFormState {
  return { ...DEFAULT_COMPOSER_STATE, ...overrides }
}

function inV3(
  editorial: Partial<P2BFormState['editorial']> = {},
  overrides: Partial<P2BFormState> = {}
): P2BFormState {
  return state({
    activeWorkflow: 'editorial_v3',
    easySetupTitle: commission.original_title,
    easySetupLocation: commission.location,
    editorial: {
      directionOptions: [],
      selectedOptionId: null,
      commissionDraft: null,
      approval: { status: 'not_started' },
      evidencePackage: null,
      reviewedCommissionFingerprint: null,
      ...editorial
    },
    ...overrides
  })
}

describe('deriveP2BSteps', () => {
  it('always describes the same five steps in the same order', () => {
    expect(deriveP2BSteps(state()).map(step => step.id)).toEqual([...P2B_STEP_IDS])
    expect(deriveP2BSteps(state()).map(step => step.number)).toEqual([1, 2, 3, 4, 5])
  })

  it('starts an untouched page on step one with nothing done', () => {
    const steps = deriveP2BSteps(state())

    expect(currentP2BStep(state()).id).toBe('start')
    expect(steps.filter(step => step.state === 'done')).toHaveLength(0)
    expect(steps.map(step => step.state)).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming'
    ])
  })

  it('keeps a typed title and location on step one until the direction prompt exists', () => {
    // Typing does not start direction work; pressing the button does.
    const typed = state({
      easySetupTitle: commission.original_title,
      easySetupLocation: commission.location
    })

    expect(currentP2BStep(typed).id).toBe('start')
    expect(deriveP2BSteps(typed)[0].summary).toBeNull()
  })

  it('moves to picking a direction once direction work has started', () => {
    const started = inV3()

    expect(currentP2BStep(started).id).toBe('direction')
    expect(currentP2BStep(started).nextAction).toMatch(/Copy the direction prompt/)
    expect(deriveP2BSteps(started)[0].state).toBe('done')
    expect(deriveP2BSteps(started)[0].summary).toContain(commission.original_title)
  })

  it('stays on picking a direction while three options wait to be chosen', () => {
    const current = currentP2BStep(inV3({ approval: { status: 'awaiting_selection' } }))

    expect(current.id).toBe('direction')
    expect(current.nextAction).toBe('Choose one of the three directions.')
  })

  it('recaps the chosen direction in the operator’s words, not as an option id', () => {
    const approved = inV3({
      selectedOptionId: 'direction-1',
      approval: { status: 'approved', commission }
    })

    expect(deriveP2BSteps(approved)[1].summary).toBe(commission.approved_direction)
    expect(deriveP2BSteps(approved)[1].summary).not.toContain('direction-1')
  })

  it('sends an edited commission back to the review step', () => {
    const edited = inV3({ approval: { status: 'needs_approval' } })

    expect(currentP2BStep(edited).id).toBe('commission')
    expect(deriveP2BSteps(edited)[1].state).toBe('done')
  })

  it('sends a draft needing reconfirmation back to the review step', () => {
    const stale = inV3({
      approval: { status: 'reconfirmation_required', reason: 'commission_edited' }
    })

    expect(currentP2BStep(stale).id).toBe('commission')
  })

  it('sends a changed title or location back to the step holding the regenerate button', () => {
    const retitled = inV3({
      approval: { status: 'reconfirmation_required', reason: 'title_or_location_changed' }
    })

    expect(currentP2BStep(retitled).id).toBe('start')
    expect(currentP2BStep(retitled).nextAction).toMatch(/Generate a new direction prompt/)
  })

  it('stops on the review step when a direction card approved a commission for you', () => {
    // Clicking a card approves outright. That says a click happened, not that
    // a human read what got locked, so the step stays open until they say so.
    const approved = inV3({ approval: { status: 'approved', commission } })

    expect(currentP2BStep(approved).id).toBe('commission')
    expect(currentP2BStep(approved).nextAction).toMatch(/Read the locked commission/)
    expect(deriveP2BSteps(approved)[2].state).toBe('current')
  })

  it('moves to gathering facts once the operator confirms the commission', () => {
    const reviewed = inV3({
      approval: { status: 'approved', commission },
      reviewedCommissionFingerprint: commission.commission_fingerprint
    })

    expect(currentP2BStep(reviewed).id).toBe('research')
    expect(currentP2BStep(reviewed).nextAction).toMatch(/Copy the research prompt/)
    expect(deriveP2BSteps(reviewed)[2].summary).toBe(commission.primary_subject)
  })

  it('ignores a review that names a different commission', () => {
    const stale = inV3({
      approval: { status: 'approved', commission },
      reviewedCommissionFingerprint: 'a-commission-that-was-edited-away'
    })

    expect(currentP2BStep(stale).id).toBe('commission')
  })

  it('reaches the writing step once matching research is attached', () => {
    const ready = inV3({
      approval: { status: 'approved', commission },
      evidencePackage,
      reviewedCommissionFingerprint: commission.commission_fingerprint
    })
    const steps = deriveP2BSteps(ready)

    expect(currentP2BStep(ready).id).toBe('write')
    expect(steps[3].state).toBe('done')
    // The Lima fixture carries exactly one of each, so this also pins the
    // singular wording a one-source package produces.
    expect(steps[3].summary).toBe('1 source, 1 claim')
  })

  it('counts sources and claims in plural when there is more than one', () => {
    const ready = inV3({
      approval: { status: 'approved', commission },
      reviewedCommissionFingerprint: commission.commission_fingerprint,
      evidencePackage: {
        ...evidencePackage,
        sources: [...(evidencePackage.sources ?? []), ...(evidencePackage.sources ?? [])]
      }
    })

    expect(deriveP2BSteps(ready)[3].summary).toBe('2 sources, 1 claim')
  })

  it('does not count research imported against another commission', () => {
    // A package for a different commission is not this commission's research,
    // however complete it looks, and the run would be refused anyway.
    const mismatched = inV3({
      approval: { status: 'approved', commission },
      reviewedCommissionFingerprint: commission.commission_fingerprint,
      evidencePackage: { ...evidencePackage, commission_fingerprint: 'someone-else' }
    })

    expect(currentP2BStep(mismatched).id).toBe('research')
    expect(deriveP2BSteps(mismatched)[3].state).toBe('current')
  })

  it('keeps research open when the attached package answers different questions', () => {
    const mismatched = inV3({
      approval: { status: 'approved', commission },
      reviewedCommissionFingerprint: commission.commission_fingerprint,
      evidencePackage: {
        ...evidencePackage,
        requirements: evidencePackage.requirements.slice(1)
      }
    })

    expect(currentP2BStep(mismatched).id).toBe('research')
    expect(currentP2BStep(mismatched).nextAction).toMatch(/exact questions/)
  })

  it('never marks the writing step done, because a finished run is not composer state', () => {
    const ready = inV3({
      approval: { status: 'approved', commission },
      evidencePackage,
      reviewedCommissionFingerprint: commission.commission_fingerprint
    })

    expect(deriveP2BSteps(ready)[4].state).toBe('current')
    expect(deriveP2BSteps(ready).some(step => step.id === 'write' && step.state === 'done')).toBe(
      false
    )
  })

  it('gives every step a name, reason, and next action a non-technical operator can read', () => {
    for (const step of deriveP2BSteps(state())) {
      expect(step.name.length).toBeGreaterThan(0)
      expect(step.purpose.length).toBeGreaterThan(0)
      expect(step.nextAction.length).toBeGreaterThan(0)
      expect(step.name).not.toMatch(/_|fingerprint|schema|v3/i)
      expect(step.nextAction).not.toMatch(/_|fingerprint|schema|v3/i)
    }
  })
})
