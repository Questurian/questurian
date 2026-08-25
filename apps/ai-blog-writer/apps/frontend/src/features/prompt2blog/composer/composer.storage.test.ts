/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  COMPOSER_STORAGE_KEY,
  COMPOSER_STORAGE_VERSION,
  DEFAULT_COMPOSER_STATE,
  loadSavedComposerState,
  saveComposerState,
} from './composer.storage'
import type { Prompt2BlogCommission, Prompt2BlogCommissionDraft } from '../api'

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

  it('preserves the reader while dropping legacy duplicate steering fields', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        targetReader: 'Budget-conscious families',
        audienceProfile: 'Families seeking free activities',
        promptEnhance: true,
      }),
    )

    const state = loadSavedComposerState()

    expect(state.targetReader).toBe('Budget-conscious families — Families seeking free activities')
    expect(state).not.toHaveProperty('audienceProfile')
    expect(state).not.toHaveProperty('promptEnhance')
  })

  it('uses legacy audience detail when the saved target reader is empty', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        targetReader: '',
        audienceProfile: 'Families seeking free activities',
      }),
    )

    expect(loadSavedComposerState().targetReader).toBe('Families seeking free activities')
  })

  it('does not repeat identical legacy audience detail', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        targetReader: 'Budget-conscious families',
        audienceProfile: 'budget-conscious families',
      }),
    )

    expect(loadSavedComposerState().targetReader).toBe('Budget-conscious families')
  })

  it('defaults editorial extras off for a new draft', () => {
    expect(DEFAULT_COMPOSER_STATE.enableEditorialAugmentation).toBe(false)
  })

  it('turns off the old unversioned editorial-augmentation default', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        enableEditorialAugmentation: true,
      }),
    )

    expect(loadSavedComposerState().enableEditorialAugmentation).toBe(false)
  })

  it('preserves editorial augmentation after a user opts in', () => {
    saveComposerState({
      ...DEFAULT_COMPOSER_STATE,
      enableEditorialAugmentation: true,
    })

    expect(loadSavedComposerState().enableEditorialAugmentation).toBe(true)
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

  it('does not reinterpret a draft written by a newer storage version', () => {
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({
        composerStorageVersion: 999,
        enableEditorialAugmentation: true,
      }),
    )

    expect(loadSavedComposerState().enableEditorialAugmentation).toBe(true)
  })

  it('migrates a v2 draft without mapping its numeric article type into v3', () => {
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
      articleTypeId: 7,
      targetReader: 'First-time visitors',
      toneId: 'balanced',
      blobs: [{ id: 8, content: 'Saved source' }],
      editorial: {
        directionOptions: [],
        commissionDraft: null,
        approval: { status: 'reconfirmation_required', reason: 'legacy_draft' },
      },
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
