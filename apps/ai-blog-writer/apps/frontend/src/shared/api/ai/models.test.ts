import { describe, expect, it } from 'vitest'

import {
  CLAUDE_MODELS_ENABLED,
  DEFAULT_EDITOR_ASSIST_MODEL,
  EDITOR_ASSIST_MODEL_OPTIONS,
  resolveEditorAssistModelName,
} from './models'

describe('editor assist models', () => {
  it('hides Claude options while Anthropic is switched off', () => {
    expect(CLAUDE_MODELS_ENABLED).toBe(false)
    expect(EDITOR_ASSIST_MODEL_OPTIONS.map((option) => option.value)).toEqual([
      'gemini-3.1-pro-preview',
    ])
  })

  it('defaults to a Google writer', () => {
    expect(DEFAULT_EDITOR_ASSIST_MODEL).toBe('gemini-3.1-pro-preview')
  })

  it('preserves supported selections and defaults unknown values', () => {
    expect(resolveEditorAssistModelName('gemini-3.1-pro-preview')).toBe('gemini-3.1-pro-preview')
    expect(resolveEditorAssistModelName('gemini-2.5-flash')).toBe(DEFAULT_EDITOR_ASSIST_MODEL)
  })

  it('falls back to the default for stored Claude selections', () => {
    expect(resolveEditorAssistModelName('claude-sonnet-5')).toBe(DEFAULT_EDITOR_ASSIST_MODEL)
    expect(resolveEditorAssistModelName('claude-opus-4-8')).toBe(DEFAULT_EDITOR_ASSIST_MODEL)
  })
})
