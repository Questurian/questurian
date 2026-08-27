import { describe, expect, it } from 'vitest'
import type {
  Prompt2BlogCommission,
  Prompt2BlogDirectionOption,
  Prompt2BlogDirectionResponse,
  Prompt2BlogEvidencePackage
} from '../api'
import { DEFAULT_COMPOSER_STATE } from './composer.storage'
import type { P2BFormState } from './composer.types'
import {
  applyValidatedDirectionResponse,
  approveCommission,
  clearDirectionWorkflow,
  clearEvidencePackage,
  editCommissionDraft,
  selectDirectionOption,
  startEditorialWorkflow,
  storeEvidencePackage
} from './commission-state'
import { fingerprintCommissionSync } from './commission'

const APP_TITLE = "Is Lima still South America's bargain expat capital?"
const APP_LOCATION = 'Lima, Peru'

function directionOption(
  optionId: 'direction-1' | 'direction-2' | 'direction-3',
  index: number
): Prompt2BlogDirectionOption {
  return {
    option_id: optionId,
    direction: `Lima-centered editorial direction ${index}.`,
    form_id: 'analysis',
    topic_module_ids: ['cost-affordability', 'long-stay-remote-work'],
    audience: {
      primary_reader: 'Prospective expats and remote workers',
      tags: ['remote-worker-relocator', 'budget-focused']
    },
    core_reader_question: `Does Lima still deliver value under scenario ${index}?`,
    reader_outcome: `Judge Lima's tradeoffs using scenario ${index}.`,
    primary_subject: 'Lima',
    scope: {
      mode: 'single_subject',
      references: [
        { name: 'Lima', role: 'primary_subject' },
        { name: 'Medellín', role: 'context_only' }
      ]
    },
    premise: [
      {
        assumption_id: 'a1',
        statement: `Scenario ${index} rests on published Lima cost data.`
      }
    ],
    requirements: [
      {
        requirement_id: 'r1',
        question: `What evidence settles scenario ${index}?`,
        assumption_ids: ['a1']
      }
    ],
    exclusions: ['Do not turn context cities into co-subjects.'],
    rationale: `Distinct rationale ${index}.`
  }
}

function directionResponse(): Prompt2BlogDirectionResponse {
  return {
    schema_version: 3,
    // Echoed identity is validated on import but never owns composer identity.
    original_title: APP_TITLE,
    location: APP_LOCATION,
    options: [
      directionOption('direction-1', 1),
      directionOption('direction-2', 2),
      directionOption('direction-3', 3)
    ]
  }
}

function state(overrides: Partial<P2BFormState> = {}): P2BFormState {
  return {
    ...DEFAULT_COMPOSER_STATE,
    editorial: {
      directionOptions: [],
      selectedOptionId: null,
      commissionDraft: null,
      approval: { status: 'not_started' },
      evidencePackage: null,
      reviewedCommissionFingerprint: null
    },
    easySetupTitle: APP_TITLE,
    easySetupLocation: APP_LOCATION,
    toneId: 'editorial',
    lengthId: 'long',
    modelStackId: 'best-value',
    modelName: 'gemini-3.1-flash-lite',
    writingModel: 'gemini-3.7-flash',
    auditModel: 'gemini-3.7-flash',
    ...overrides
  }
}

function selectedState(): P2BFormState {
  return selectDirectionOption(
    applyValidatedDirectionResponse(state(), directionResponse()),
    'direction-2'
  )
}

describe('commission state', () => {
  it('starts editorial work by clearing stale direction state only', () => {
    const approved = {
      ...selectedState(),
      editorial: {
        ...selectedState().editorial,
        approval: {
          status: 'approved' as const,
          commission: {
            ...selectedState().editorial.commissionDraft!,
            commission_fingerprint: 'sha256:old'
          }
        }
      }
    }

    const next = startEditorialWorkflow(approved)

    expect(next.activeWorkflow).toBe('editorial_v3')
    expect(next.editorial).toEqual({
      directionOptions: [],
      reviewedCommissionFingerprint: null,
      selectedOptionId: null,
      commissionDraft: null,
      approval: { status: 'not_started' },
      evidencePackage: null
    })
    expect(next.modelStackId).toBe('best-value')
    expect(next.toneId).toBe('editorial')
  })

  it('stores validated options without selecting one', () => {
    const next = applyValidatedDirectionResponse(state(), directionResponse())

    expect(next.activeWorkflow).toBe('editorial_v3')
    expect(next.editorial.directionOptions).toHaveLength(3)
    expect(next.editorial.selectedOptionId).toBeNull()
    expect(next.editorial.commissionDraft).toBeNull()
    expect(next.editorial.approval).toEqual({ status: 'awaiting_selection' })
  })

  it('makes the draft from the chosen option but keeps exact app-owned identity', () => {
    const imported = applyValidatedDirectionResponse(
      state(),
      directionResponse()
    )
    // Prove selection does not read identity back from the response object;
    // confirmation trims only outer input whitespace.
    imported.easySetupTitle = '  Exact app title — spacing stays  '
    imported.easySetupLocation = 'Lima, Perú — app value'

    const next = selectDirectionOption(imported, 'direction-2')

    expect(next.editorial.selectedOptionId).toBe('direction-2')
    expect(next.editorial.commissionDraft).toMatchObject({
      schema_version: 3,
      original_title: 'Exact app title — spacing stays',
      location: 'Lima, Perú — app value',
      approved_direction: 'Lima-centered editorial direction 2.',
      form_id: 'analysis',
      primary_subject: 'Lima',
      call_to_action: null
    })
    expect(next.editorial.approval).toEqual({ status: 'needs_approval' })
    expect(next.editorial.commissionDraft).not.toHaveProperty('option_id')
    expect(next.editorial.commissionDraft).not.toHaveProperty('rationale')
  })

  it('stores a fingerprinted approval then retracts it on a commission edit', () => {
    const selected = selectedState()
    const commission: Prompt2BlogCommission = {
      ...selected.editorial.commissionDraft!,
      commission_fingerprint: fingerprintCommissionSync(
        selected.editorial.commissionDraft!
      )
    }
    const approved = approveCommission(selected, commission)

    expect(approved.editorial.approval).toEqual({
      status: 'approved',
      commission
    })

    const edited = editCommissionDraft(approved, {
      approved_direction: 'Edited Lima-centered direction.',
      original_title: 'Attempted replacement title',
      location: 'Attempted replacement location'
    })

    expect(edited.editorial.commissionDraft?.approved_direction).toBe(
      'Edited Lima-centered direction.'
    )
    expect(edited.editorial.commissionDraft?.original_title).toBe(APP_TITLE)
    expect(edited.editorial.commissionDraft?.location).toBe(APP_LOCATION)
    expect(edited.editorial.approval).toEqual({
      status: 'reconfirmation_required',
      reason: 'commission_edited'
    })
    expect(edited.modelStackId).toBe(approved.modelStackId)
    expect(edited.modelName).toBe(approved.modelName)
    expect(edited.writingModel).toBe(approved.writingModel)
    expect(edited.auditModel).toBe(approved.auditModel)
    expect(edited.toneId).toBe(approved.toneId)
    expect(edited.lengthId).toBe(approved.lengthId)
  })

  it('rejects approval that replaces the app-owned title or location', () => {
    const selected = selectedState()
    const commission: Prompt2BlogCommission = {
      ...selected.editorial.commissionDraft!,
      commission_fingerprint: fingerprintCommissionSync(
        selected.editorial.commissionDraft!
      ),
      original_title: 'Model replacement title'
    }

    expect(() => approveCommission(selected, commission)).toThrow(
      'Approved commission must keep the app-owned title and location.'
    )
  })

  it('rejects a stale fingerprint result after the commission draft changes', () => {
    const selected = selectedState()
    const staleCommission: Prompt2BlogCommission = {
      ...selected.editorial.commissionDraft!,
      commission_fingerprint: fingerprintCommissionSync(
        selected.editorial.commissionDraft!
      )
    }
    const edited = editCommissionDraft(selected, {
      approved_direction: 'A newly edited direction.'
    })

    expect(() => approveCommission(edited, staleCommission)).toThrow(
      'must match the current commission draft'
    )
  })

  it('clears direction state back to legacy without clearing the profile fields', () => {
    const current = selectedState()

    const next = clearDirectionWorkflow(current)

    expect(next.activeWorkflow).toBe('legacy_v2')
    expect(next.editorial).toEqual({
      directionOptions: [],
      reviewedCommissionFingerprint: null,
      selectedOptionId: null,
      commissionDraft: null,
      approval: { status: 'not_started' },
      evidencePackage: null
    })
    expect(next.modelStackId).toBe('best-value')
    expect(next.toneId).toBe('editorial')
  })
})

function evidence(fingerprint: string): Prompt2BlogEvidencePackage {
  return {
    schema_version: 3,
    commission_fingerprint: fingerprint,
    sources: [],
    claims: [],
    requirements: [
      { requirement_id: 'r1', status: 'missing', claim_ids: [], gap: 'Open.' }
    ],
    conflicts: [],
    gaps: []
  }
}

function approvedState(): {
  state: P2BFormState
  commission: Prompt2BlogCommission
} {
  const selected = selectedState()
  const commission: Prompt2BlogCommission = {
    ...selected.editorial.commissionDraft!,
    commission_fingerprint: fingerprintCommissionSync(
      selected.editorial.commissionDraft!
    )
  }
  return { state: approveCommission(selected, commission), commission }
}

describe('commission evidence state', () => {
  it('attaches evidence to the approved commission and drops it on edit', () => {
    const { state: approved, commission } = approvedState()

    const withEvidence = storeEvidencePackage(
      approved,
      evidence(commission.commission_fingerprint)
    )
    expect(withEvidence.editorial.evidencePackage).not.toBeNull()

    const edited = editCommissionDraft(withEvidence, {
      approved_direction: 'Edited Lima-centered direction.'
    })
    expect(edited.editorial.evidencePackage).toBeNull()
  })

  it('refuses evidence that belongs to another commission or to no approval', () => {
    const { state: approved } = approvedState()

    expect(() =>
      storeEvidencePackage(approved, evidence('f'.repeat(64)))
    ).toThrow(/currently approved commission/)
    expect(() =>
      storeEvidencePackage(selectedState(), evidence('f'.repeat(64)))
    ).toThrow(/currently approved commission/)
  })

  it('keeps evidence across a re-approval of the same commission only', () => {
    const { state: approved, commission } = approvedState()
    const withEvidence = storeEvidencePackage(
      approved,
      evidence(commission.commission_fingerprint)
    )

    expect(
      approveCommission(withEvidence, commission).editorial.evidencePackage
    ).not.toBeNull()

    const edited = editCommissionDraft(withEvidence, {
      approved_direction: 'A materially different Lima direction.'
    })
    const reApproved = approveCommission(
      { ...edited, editorial: { ...edited.editorial, evidencePackage: withEvidence.editorial.evidencePackage } },
      {
        ...edited.editorial.commissionDraft!,
        commission_fingerprint: fingerprintCommissionSync(
          edited.editorial.commissionDraft!
        )
      }
    )
    expect(reApproved.editorial.evidencePackage).toBeNull()
  })

  it('drops evidence when research or the whole workflow is cleared', () => {
    const { state: approved, commission } = approvedState()
    const withEvidence = storeEvidencePackage(
      approved,
      evidence(commission.commission_fingerprint)
    )

    expect(clearEvidencePackage(withEvidence).editorial.evidencePackage).toBeNull()
    expect(
      clearEvidencePackage(withEvidence).editorial.approval
    ).toEqual(withEvidence.editorial.approval)
    expect(
      clearDirectionWorkflow(withEvidence).editorial.evidencePackage
    ).toBeNull()
  })
})
