export type EditorAssistModelName =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'

export const DEFAULT_EDITOR_ASSIST_MODEL: EditorAssistModelName = 'gemini-2.5-flash'

export const EDITOR_ASSIST_MODEL_OPTIONS: Array<{ value: EditorAssistModelName; label: string }> = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
]

export function resolveEditorAssistModelName(value?: string): EditorAssistModelName {
  if (value === 'gemini-2.5-flash') return value
  if (value === 'gemini-2.5-pro') return value
  if (value === 'gemini-2.0-flash') return value
  return DEFAULT_EDITOR_ASSIST_MODEL
}
