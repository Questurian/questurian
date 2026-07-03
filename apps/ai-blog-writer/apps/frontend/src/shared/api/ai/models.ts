export type EditorAssistModelName = 'claude-opus-4-8'

export const DEFAULT_EDITOR_ASSIST_MODEL: EditorAssistModelName = 'claude-opus-4-8'

export const EDITOR_ASSIST_MODEL_OPTIONS: Array<{ value: EditorAssistModelName; label: string }> = [
  {
    value: 'claude-opus-4-8',
    label: 'Claude Opus 4.8 (writer; Evidence Profile runs on Gemini)',
  },
]

export type Y2BModelName =
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.1-flash-lite-preview'
  | 'gemini-3.1-flash-image-preview'

export const DEFAULT_Y2B_MODEL: Y2BModelName = 'gemini-2.5-flash-lite'

export const Y2B_MODEL_OPTIONS: Array<{ value: Y2BModelName; label: string }> = [
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (default — fast & cheap)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (best quality)' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (Preview)' },
  { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (Preview)' },
]

export function resolveEditorAssistModelName(_value?: string): EditorAssistModelName {
  return DEFAULT_EDITOR_ASSIST_MODEL
}
