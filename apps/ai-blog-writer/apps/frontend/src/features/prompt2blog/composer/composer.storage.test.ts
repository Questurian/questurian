/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  COMPOSER_STORAGE_KEY,
  DEFAULT_COMPOSER_STATE,
  loadSavedComposerState,
  saveComposerState,
} from './composer.storage'

describe('loadSavedComposerState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('preserves the reader while dropping legacy duplicate steering fields', () => {
    localStorage.setItem(COMPOSER_STORAGE_KEY, JSON.stringify({
      targetReader: 'Budget-conscious families',
      audienceProfile: 'Families seeking free activities',
      promptEnhance: true,
    }))

    const state = loadSavedComposerState()

    expect(state.targetReader).toBe(
      'Budget-conscious families — Families seeking free activities',
    )
    expect(state).not.toHaveProperty('audienceProfile')
    expect(state).not.toHaveProperty('promptEnhance')
  })

  it('uses legacy audience detail when the saved target reader is empty', () => {
    localStorage.setItem(COMPOSER_STORAGE_KEY, JSON.stringify({
      targetReader: '',
      audienceProfile: 'Families seeking free activities',
    }))

    expect(loadSavedComposerState().targetReader).toBe(
      'Families seeking free activities',
    )
  })

  it('does not repeat identical legacy audience detail', () => {
    localStorage.setItem(COMPOSER_STORAGE_KEY, JSON.stringify({
      targetReader: 'Budget-conscious families',
      audienceProfile: 'budget-conscious families',
    }))

    expect(loadSavedComposerState().targetReader).toBe('Budget-conscious families')
  })

  it('defaults editorial extras off for a new draft', () => {
    expect(DEFAULT_COMPOSER_STATE.enableEditorialAugmentation).toBe(false)
  })

  it('turns off the old unversioned editorial-augmentation default', () => {
    localStorage.setItem(COMPOSER_STORAGE_KEY, JSON.stringify({
      enableEditorialAugmentation: true,
    }))

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
    localStorage.setItem(COMPOSER_STORAGE_KEY, JSON.stringify({
      composerStorageVersion: 999,
      enableEditorialAugmentation: true,
    }))

    expect(loadSavedComposerState().enableEditorialAugmentation).toBe(true)
  })
})
