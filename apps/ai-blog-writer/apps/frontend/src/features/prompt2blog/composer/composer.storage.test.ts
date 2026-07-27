/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { COMPOSER_STORAGE_KEY, loadSavedComposerState } from './composer.storage'

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
})
