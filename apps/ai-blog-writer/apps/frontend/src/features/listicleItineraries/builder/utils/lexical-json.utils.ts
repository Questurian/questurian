import { stripIdsDeep } from './itinerary-payload-sanitize'

/**
 * Lexical JSON (and Payload round-trips) embed `id` on many nodes. Postgres row ids
 * for rich text must be unique; strip every `id` key in the tree before API submit.
 */
export function stripLexicalEditorStateId<T>(value: T): T {
  return stripIdsDeep(value) as T
}

export function readLexicalFromJsonText(value: string, fieldLabel: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) return {}

  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${fieldLabel} JSON must be an object`)
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    throw new Error(err instanceof Error ? `${fieldLabel}: ${err.message}` : `${fieldLabel}: invalid JSON`)
  }
}
