export function resizeTextareaToContent(element: HTMLTextAreaElement): void {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

export function getSelectionRangeWithinEditor(editor: HTMLElement): Range | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return null
  return range
}

export function restoreSelectionRange(range: Range): void {
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

export function findClosestElementWithinEditor(
  node: Node | null,
  editor: HTMLElement,
  predicate: (element: HTMLElement) => boolean,
): HTMLElement | null {
  if (!node) return null

  let current: Node | null = node
  while (current && current !== editor) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as HTMLElement
      if (predicate(element)) {
        return element
      }
    }
    current = current.parentNode
  }

  return null
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'BLOCKQUOTE', 'LI'])

function isBlockElement(element: HTMLElement): boolean {
  const tag = element.tagName.toUpperCase()
  return BLOCK_TAGS.has(tag) || /^H[1-6]$/.test(tag)
}

/** The block-level element the caret currently sits in, if any. */
export function getActiveBlockElement(editor: HTMLElement): HTMLElement | null {
  const range = getSelectionRangeWithinEditor(editor)
  if (!range) return null
  return findClosestElementWithinEditor(range.startContainer, editor, isBlockElement)
}

export function getActiveBlockTag(editor: HTMLElement): string | null {
  return getActiveBlockElement(editor)?.tagName.toUpperCase() ?? null
}

/**
 * A range covering everything from the start of `block` up to the caret.
 *
 * Returned as a live range rather than a string so the caller can both read the
 * text and delete exactly that span — matching and removing a typed prefix have
 * to agree on the boundary, and re-deriving it twice invites drift.
 */
export function getRangeFromBlockStartToCaret(
  editor: HTMLElement,
  block: HTMLElement,
): Range | null {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return null

  const caretRange = selection.getRangeAt(0)
  if (!editor.contains(caretRange.startContainer)) return null
  if (!block.contains(caretRange.startContainer)) return null

  const range = document.createRange()
  range.selectNodeContents(block)
  range.setEnd(caretRange.startContainer, caretRange.startOffset)
  return range
}

/** True when the caret sits at the very end of `block`'s content. */
export function isCaretAtEndOfBlock(editor: HTMLElement, block: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false

  const caretRange = selection.getRangeAt(0)
  if (!editor.contains(caretRange.startContainer)) return false

  const tailRange = document.createRange()
  tailRange.selectNodeContents(block)
  tailRange.setStart(caretRange.endContainer, caretRange.endOffset)
  return tailRange.toString().length === 0
}

export function collapseSelectionTo(range: Range, toStart: boolean): void {
  const selection = window.getSelection()
  if (!selection) return

  const collapsed = range.cloneRange()
  collapsed.collapse(toStart)
  selection.removeAllRanges()
  selection.addRange(collapsed)
}

export function placeCaretAtEnd(editor: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}
