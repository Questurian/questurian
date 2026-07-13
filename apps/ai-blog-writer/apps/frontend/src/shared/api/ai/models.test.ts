import { describe, expect, it } from 'vitest'

import {
  DEFAULT_EDITOR_ASSIST_MODEL,
  EDITOR_ASSIST_MODEL_OPTIONS,
  resolveEditorAssistModelName,
} from './models'

describe('editor assist models', () => {
  it('offers Opus and Sonnet', () => {
    expect(EDITOR_ASSIST_MODEL_OPTIONS.map((option) => option.value)).toEqual([
      'claude-opus-4-8',
      'claude-sonnet-5',
    ])
  })

  it('preserves supported selections and defaults unknown values', () => {
    expect(resolveEditorAssistModelName('claude-sonnet-5')).toBe('claude-sonnet-5')
    expect(resolveEditorAssistModelName('gemini-2.5-flash')).toBe(DEFAULT_EDITOR_ASSIST_MODEL)
  })
})
