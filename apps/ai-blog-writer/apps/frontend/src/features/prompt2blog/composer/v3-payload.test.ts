import { describe, expect, it } from 'vitest'
import limaFixture from '../../../../../../data/fixtures/prompt2blog/lima-scope-drift-v3.json'
import type { Prompt2BlogCommission, Prompt2BlogEvidencePackage } from '../api'
import { DEFAULT_COMPOSER_STATE } from './composer.storage'
import type { P2BFormState } from './composer.types'
import { resolvePrompt2BlogModelStack } from '../constants/prompt2blog.constants'
import {
  buildPrompt2BlogV3Payload,
  prompt2BlogSubmissionBlockedReason,
  v3SubmissionBlockedReason,
} from './v3-payload'

const commission = limaFixture.commission as unknown as Prompt2BlogCommission
const evidencePackage = limaFixture.evidence_package as unknown as Prompt2BlogEvidencePackage

function approvedState(overrides: Partial<P2BFormState> = {}): P2BFormState {
  return {
    ...DEFAULT_COMPOSER_STATE,
    activeWorkflow: 'editorial_v3',
    easySetupTitle: commission.original_title,
    easySetupLocation: commission.location,
    toneId: 'balanced',
    lengthId: 'standard',
    brandVoiceId: 'questurian',
    editorial: {
      directionOptions: [],
      selectedOptionId: 'direction-1',
      commissionDraft: null,
      approval: { status: 'approved', commission },
      evidencePackage,
      reviewedCommissionFingerprint: commission.commission_fingerprint,
    },
    ...overrides,
  }
}

describe('v3SubmissionBlockedReason', () => {
  it('does not speak for a legacy v2 draft', () => {
    expect(v3SubmissionBlockedReason({ ...approvedState(), activeWorkflow: 'legacy_v2' })).toBeNull()
  })

  it('allows an approved commission with matching research', () => {
    expect(v3SubmissionBlockedReason(approvedState())).toBeNull()
  })

  it('allows a run whose research still has open gaps, because the gate is the backend’s', () => {
    // The Lima fixture leaves r2 missing on purpose. Submitting returns
    // `needs_research` with a follow-up prompt, which the user has to see.
    expect(
      evidencePackage.requirements.some(requirement => requirement.status !== 'supported'),
    ).toBe(true)
    expect(v3SubmissionBlockedReason(approvedState())).toBeNull()
  })

  it('names each unapproved stage of the direction flow', () => {
    const reasonFor = (approval: P2BFormState['editorial']['approval']) =>
      v3SubmissionBlockedReason(
        approvedState({ editorial: { ...approvedState().editorial, approval } }),
      )

    expect(reasonFor({ status: 'not_started' })).toMatch(/Copy the direction prompt/)
    expect(reasonFor({ status: 'awaiting_selection' })).toMatch(/Choose one of the three/)
    expect(reasonFor({ status: 'needs_approval' })).toMatch(/approve it/)
    expect(reasonFor({ status: 'reconfirmation_required', reason: 'legacy_draft' })).toMatch(
      /approve it again/,
    )
    expect(reasonFor({ status: 'reconfirmation_required', reason: 'commission_edited' })).toMatch(
      /approve it again/,
    )
    expect(
      reasonFor({ status: 'reconfirmation_required', reason: 'title_or_location_changed' }),
    ).toMatch(/Generate a new direction prompt/)
  })

  it('keeps a card-approved commission stopped until the operator reviews it', () => {
    expect(
      v3SubmissionBlockedReason(
        approvedState({
          editorial: {
            ...approvedState().editorial,
            reviewedCommissionFingerprint: null,
          },
        }),
      ),
    ).toMatch(/Read the locked commission/)
  })

  it('blocks when no research is attached', () => {
    expect(
      v3SubmissionBlockedReason(
        approvedState({ editorial: { ...approvedState().editorial, evidencePackage: null } }),
      ),
    ).toMatch(/Copy the research prompt/)
  })

  it('blocks research belonging to a different commission', () => {
    expect(
      v3SubmissionBlockedReason(
        approvedState({
          editorial: {
            ...approvedState().editorial,
            evidencePackage: { ...evidencePackage, commission_fingerprint: 'other' },
          },
        }),
      ),
    ).toMatch(/Clear the attached research/)
  })

  it('blocks research that answers a different requirement set', () => {
    expect(
      v3SubmissionBlockedReason(
        approvedState({
          editorial: {
            ...approvedState().editorial,
            evidencePackage: {
              ...evidencePackage,
              requirements: evidencePackage.requirements.slice(1),
            },
          },
        }),
      ),
    ).toMatch(/exact questions/)
  })

  it('blocks a missing tone or length', () => {
    expect(v3SubmissionBlockedReason(approvedState({ toneId: '' }))).toMatch(/tone and length/)
    expect(v3SubmissionBlockedReason(approvedState({ lengthId: '' }))).toMatch(/tone and length/)
  })

})

describe('prompt2BlogSubmissionBlockedReason', () => {
  it('points an untouched page to the first step', () => {
    expect(
      prompt2BlogSubmissionBlockedReason({ ...approvedState(), activeWorkflow: 'legacy_v2' }),
    ).toMatch(/Enter a working title, location, and how long/)
  })
})

describe('buildPrompt2BlogV3Payload', () => {
  it('returns null for a legacy v2 draft', () => {
    expect(
      buildPrompt2BlogV3Payload({ ...approvedState(), activeWorkflow: 'legacy_v2' }),
    ).toBeNull()
  })

  it('returns null whenever a blocker is reported', () => {
    expect(buildPrompt2BlogV3Payload(approvedState({ toneId: '' }))).toBeNull()
    expect(buildPrompt2BlogV3Payload(approvedState({ lengthId: '' }))).toBeNull()
  })

  it('sends the approved commission and evidence package whole', () => {
    const payload = buildPrompt2BlogV3Payload(approvedState())

    expect(payload?.commission).toEqual(commission)
    expect(payload?.evidence_package).toEqual(evidencePackage)
    expect(payload?.schema_version).toBe(3)
  })

  it('carries the writing profiles and model routing the composer holds', () => {
    const payload = buildPrompt2BlogV3Payload(approvedState({ creativityLevel: 'low' }))

    expect(payload?.profiles).toEqual({
      tone_id: 'balanced',
      length_id: 'standard',
      brand_voice_id: 'questurian',
      creativity_level: 'low',
    })
    // Read off the stack the draft names, not off mirrored copies in composer
    // state: state carried three of the six roles, so the two could disagree.
    const stack = resolvePrompt2BlogModelStack(DEFAULT_COMPOSER_STATE.modelStackId)
    expect(payload?.model_routing).toEqual({
      model_name: stack.modelName,
      writing_model: stack.writingModel,
      repair_model: stack.repairModel,
      audit_model: stack.auditModel,
      outline_model: stack.outlineModel,
      groundedness_model: stack.groundednessModel,
      title_model: stack.titleModel,
      model_stack_id: stack.id,
    })
  })

  it('sends a null brand voice rather than an empty id the backend would reject', () => {
    expect(buildPrompt2BlogV3Payload(approvedState({ brandVoiceId: '' }))?.profiles.brand_voice_id)
      .toBeNull()
  })

  it('never asks v3 for editorial augmentation', () => {
    expect(buildPrompt2BlogV3Payload(approvedState())?.enable_editorial_augmentation).toBe(false)
  })
})
