/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  COMPOSER_STORAGE_KEY,
  COMPOSER_STORAGE_VERSION,
  DEFAULT_COMPOSER_STATE,
  loadSavedComposerState,
  saveComposerState,
} from './composer.storage'
import type {
  Prompt2BlogCommission,
  Prompt2BlogCommissionDraft,
  Prompt2BlogEvidencePackage,
} from '../api'
import { fingerprintCommissionSync } from './commission'

const APPROVED_COMMISSION: Prompt2BlogCommission = {
  schema_version: 3,
  commission_fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  original_title: 'A week in Lima',
  location: 'Lima, Peru',
  approved_direction: 'A first-time visitor service guide',
  form_id: 'service-guide',
  topic_module_ids: ['food-drink', 'transportation'],
  audience: {
    primary_reader: 'First-time visitors',
    tags: ['first-time-visitor'],
  },
  core_reader_question: 'How should I plan the week?',
  reader_outcome: 'A realistic plan',
  primary_subject: 'Lima',
  scope: {
    mode: 'single_subject',
    references: [{ name: 'Lima', role: 'primary_subject' }],
  },
  requirements: [{ requirement_id: 'r1', question: 'What should I book first?' }],
  exclusions: [],
  call_to_action: null,
}

function withoutFingerprint(commission: Prompt2BlogCommission): Prompt2BlogCommissionDraft {
  const { commission_fingerprint: fingerprint, ...draft } = commission
  void fingerprint
  return draft
}

APPROVED_COMMISSION.commission_fingerprint = fingerprintCommissionSync(
  withoutFingerprint(APPROVED_COMMISSION),
)

function storedDirectionOptions() {
  return (['direction-1', 'direction-2', 'direction-3'] as const).map((optionId, index) => ({
    option_id: optionId,
    direction: `Direction ${index + 1}`,
    form_id: 'service-guide' as const,
    topic_module_ids: ['food-drink' as const],
    audience: {
      primary_reader: `Reader ${index + 1}`,
      tags: ['first-time-visitor' as const],
    },
    core_reader_question: `Question ${index + 1}?`,
    reader_outcome: `Outcome ${index + 1}`,
    primary_subject: 'Lima',
    scope: {
      mode: 'single_subject' as const,
      references: [{ name: 'Lima', role: 'primary_subject' as const }],
    },
    requirements: [{ requirement_id: `r${index + 1}`, question: `Evidence ${index + 1}?` }],
    exclusions: [`Exclusion ${index + 1}`],
    rationale: `Rationale ${index + 1}`,
  }))
}

describe('loadSavedComposerState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('drops every field the v2 composer owned instead of restoring it', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        composerStorageVersion: 2,
        articleTypeId: 7,
        targetReader: 'Budget-conscious families',
        audienceProfile: 'Families seeking free activities',
        promptEnhance: true,
        enableEditorialAugmentation: true,
        blobs: [{ id: 8, content: 'Saved source' }],
      }),
    )

    const state = loadSavedComposerState()

    for (const key of [
      'articleTypeId',
      'targetReader',
      'audienceProfile',
      'promptEnhance',
      'enableEditorialAugmentation',
      'blobs',
    ]) {
      expect(state).not.toHaveProperty(key)
    }
  })

  it('preserves the selected full-pipeline model stack', () => {
    saveComposerState({
      ...DEFAULT_COMPOSER_STATE,
      modelStackId: 'economy',
      modelName: 'gemini-3.1-flash-lite',
      writingModel: 'gemini-3.1-flash-lite',
      auditModel: 'gemini-3.1-flash-lite',
    })

    expect(loadSavedComposerState()).toMatchObject({
      modelStackId: 'economy',
      modelName: 'gemini-3.1-flash-lite',
      writingModel: 'gemini-3.1-flash-lite',
      auditModel: 'gemini-3.1-flash-lite',
    })
  })

  it('does not reinterpret or overwrite a draft written by a newer storage version', () => {
    const futureDraft = JSON.stringify({
      composerStorageVersion: 999,
      activeWorkflow: 'future_v4',
      futureEditorialState: { protected: true },
    })
    localStorage.setItem(COMPOSER_STORAGE_KEY, futureDraft)

    expect(loadSavedComposerState()).toBe(DEFAULT_COMPOSER_STATE)
    saveComposerState(DEFAULT_COMPOSER_STATE)
    expect(localStorage.getItem(COMPOSER_STORAGE_KEY)).toBe(futureDraft)
  })

  it('asks a v2 draft to be reconfirmed rather than mapping its numeric type into v3', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        composerStorageVersion: 2,
        easySetupTitle: 'A week in Lima',
        easySetupLocation: 'Lima, Peru',
        articleTypeId: 7,
        targetReader: 'First-time visitors',
        toneId: 'balanced',
        blobs: [{ id: 8, content: 'Saved source' }],
      }),
    )

    const state = loadSavedComposerState()

    expect(state).toMatchObject({
      activeWorkflow: 'legacy_v2',
      easySetupTitle: 'A week in Lima',
      easySetupLocation: 'Lima, Peru',
      toneId: 'balanced',
      editorial: {
        directionOptions: [],
        commissionDraft: null,
        approval: { status: 'reconfirmation_required', reason: 'legacy_draft' },
      },
    })
  })

  it('leaves an empty v2 draft alone rather than demanding reconfirmation', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({ composerStorageVersion: 2, toneId: 'balanced' }),
    )

    expect(loadSavedComposerState().editorial.approval).toEqual({ status: 'not_started' })
  })

  it('still detects real work in a draft whose fields the composer no longer has', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({ composerStorageVersion: 2, articleGoal: 'Help readers plan a trip.' }),
    )

    expect(loadSavedComposerState().editorial.approval).toEqual({
      status: 'reconfirmation_required',
      reason: 'legacy_draft',
    })
  })

  it('round-trips an approved v3 commission separately from its editable draft', () => {
    saveComposerState({
      ...DEFAULT_COMPOSER_STATE,
      activeWorkflow: 'editorial_v3',
      editorial: {
        directionOptions: storedDirectionOptions(),
        selectedOptionId: 'direction-1',
        commissionDraft: withoutFingerprint(APPROVED_COMMISSION),
        approval: { status: 'approved', commission: APPROVED_COMMISSION },
        evidencePackage: null,
      },
    })

    expect(loadSavedComposerState()).toMatchObject({
      activeWorkflow: 'editorial_v3',
      editorial: {
        selectedOptionId: 'direction-1',
        approval: { status: 'approved', commission: APPROVED_COMMISSION },
      },
    })
    expect(JSON.parse(localStorage.getItem(COMPOSER_STORAGE_KEY) ?? '{}')).toHaveProperty(
      'composerStorageVersion',
      COMPOSER_STORAGE_VERSION,
    )
  })

  it('discards an approval whose body no longer matches the editable draft', () => {
    const draft = withoutFingerprint(APPROVED_COMMISSION)
    const staleCommission: Prompt2BlogCommission = {
      ...APPROVED_COMMISSION,
      approved_direction: 'A stale direction from another option',
      commission_fingerprint: '',
    }
    staleCommission.commission_fingerprint = fingerprintCommissionSync(staleCommission)
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_COMPOSER_STATE,
        composerStorageVersion: 3,
        activeWorkflow: 'editorial_v3',
        editorial: {
          directionOptions: storedDirectionOptions(),
          selectedOptionId: 'direction-1',
          commissionDraft: draft,
          approval: { status: 'approved', commission: staleCommission },
        },
      }),
    )

    expect(loadSavedComposerState().editorial).toEqual(DEFAULT_COMPOSER_STATE.editorial)
  })

  it('discards restored commissions containing unknown catalog IDs', () => {
    const malformed = {
      ...withoutFingerprint(APPROVED_COMMISSION),
      topic_module_ids: ['invented-module'],
    }
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_COMPOSER_STATE,
        composerStorageVersion: 3,
        activeWorkflow: 'editorial_v3',
        editorial: {
          directionOptions: storedDirectionOptions(),
          selectedOptionId: 'direction-1',
          commissionDraft: malformed,
          approval: { status: 'needs_approval' },
        },
      }),
    )

    expect(loadSavedComposerState().editorial).toEqual(DEFAULT_COMPOSER_STATE.editorial)
  })

  it('fails closed when a saved approval has no commission fingerprint', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        composerStorageVersion: 3,
        activeWorkflow: 'editorial_v3',
        editorial: {
          directionOptions: [],
          selectedOptionId: null,
          commissionDraft: null,
          approval: {
            status: 'approved',
            commission: { original_title: 'Unsafe', location: 'Unknown' },
          },
        },
      }),
    )

    expect(loadSavedComposerState().editorial).toEqual(DEFAULT_COMPOSER_STATE.editorial)
  })
})

function storedEvidence(
  fingerprint = APPROVED_COMMISSION.commission_fingerprint,
): Prompt2BlogEvidencePackage {
  return {
    schema_version: 3,
    commission_fingerprint: fingerprint,
    sources: [
      {
        source_id: 's1',
        title: 'Lima booking guidance',
        publisher: 'City tourism office',
        url: 'https://example.com/lima-booking',
        published_at: '2026-06-01',
        retrieved_at: '2026-08-25',
        source_type: 'official',
        material_type: 'web',
        notes: ['Names the booking windows that matter first.'],
      },
    ],
    claims: [
      {
        claim_id: 'c1',
        text: 'Airport transfers should be booked before arrival.',
        source_ids: ['s1'],
        requirement_ids: ['r1'],
        as_of: '2026-06-01',
        confidence: 'high',
      },
    ],
    requirements: [
      { requirement_id: 'r1', status: 'supported', claim_ids: ['c1'], gap: '' },
    ],
    conflicts: [],
    gaps: [],
  }
}

function saveApprovedDraftWithEvidence(evidencePackage: unknown): void {
  localStorage.setItem(
    COMPOSER_STORAGE_KEY,
    JSON.stringify({
      ...DEFAULT_COMPOSER_STATE,
      composerStorageVersion: COMPOSER_STORAGE_VERSION,
      activeWorkflow: 'editorial_v3',
      editorial: {
        directionOptions: storedDirectionOptions(),
        selectedOptionId: 'direction-1',
        commissionDraft: withoutFingerprint(APPROVED_COMMISSION),
        approval: { status: 'approved', commission: APPROVED_COMMISSION },
        evidencePackage,
      },
    }),
  )
}

describe('stored evidence packages', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('restores evidence that still matches the approved commission', () => {
    saveApprovedDraftWithEvidence(storedEvidence())

    expect(loadSavedComposerState().editorial.evidencePackage).toEqual(storedEvidence())
  })

  it('drops evidence fingerprinted for a different commission', () => {
    saveApprovedDraftWithEvidence(storedEvidence('b'.repeat(64)))

    const loaded = loadSavedComposerState()
    expect(loaded.editorial.evidencePackage).toBeNull()
    expect(loaded.editorial.approval).toEqual({
      status: 'approved',
      commission: APPROVED_COMMISSION,
    })
  })

  it('drops evidence whose stored body no longer validates', () => {
    const broken = storedEvidence()
    broken.claims![0].source_ids = ['s404']
    saveApprovedDraftWithEvidence(broken)

    const loaded = loadSavedComposerState()
    expect(loaded.editorial.evidencePackage).toBeNull()
    expect(loaded.editorial.approval).toEqual({
      status: 'approved',
      commission: APPROVED_COMMISSION,
    })
  })

  it('drops evidence stored against an unapproved commission', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_COMPOSER_STATE,
        composerStorageVersion: COMPOSER_STORAGE_VERSION,
        activeWorkflow: 'editorial_v3',
        editorial: {
          directionOptions: storedDirectionOptions(),
          selectedOptionId: 'direction-1',
          commissionDraft: withoutFingerprint(APPROVED_COMMISSION),
          approval: { status: 'needs_approval' },
          evidencePackage: storedEvidence(),
        },
      }),
    )

    expect(loadSavedComposerState().editorial.evidencePackage).toBeNull()
  })
})
