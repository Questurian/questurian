import type { ToolbarActionKey } from '../types'

export type EditorFormatState = {
  blockTag: string | null
  isBold: boolean
  isItalic: boolean
  isUnorderedList: boolean
  isOrderedList: boolean
}

/**
 * Which toolbar buttons describe the caret's current formatting.
 *
 * The toolbar had no active state at all, so nothing told the author the caret
 * was inside an H2 — and since the heading buttons toggle, the only way back to
 * body text was to press H2 a second time and hope. That is invisible unless
 * you already know it, which is why `paragraph` is now an explicit action.
 */
export function resolveActiveToolbarKeys(state: EditorFormatState): Set<ToolbarActionKey> {
  const active = new Set<ToolbarActionKey>()
  const tag = state.blockTag?.toUpperCase() ?? null

  if (state.isUnorderedList) active.add('bullets')
  if (state.isOrderedList) active.add('numbered')
  if (state.isBold) active.add('bold')
  if (state.isItalic) active.add('italic')

  if (tag === 'H2') active.add('h2')
  if (tag === 'H3') active.add('h3')
  if (tag === 'BLOCKQUOTE') active.add('quote')

  // A list item is its own kind of block, so it is not "normal text" even
  // though the browser reports no heading tag for it.
  const isPlainBlock = tag === 'P' || tag === 'DIV'
  if (isPlainBlock && !state.isUnorderedList && !state.isOrderedList) {
    active.add('paragraph')
  }

  return active
}
