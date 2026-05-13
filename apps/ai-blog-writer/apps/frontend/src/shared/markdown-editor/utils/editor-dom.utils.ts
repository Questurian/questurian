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

export function getActiveBlockTag(editor: HTMLElement): string | null {
  const range = getSelectionRangeWithinEditor(editor)
  if (!range) return null

  const block = findClosestElementWithinEditor(range.startContainer, editor, (element) => {
    const tag = element.tagName.toUpperCase()
    return tag === 'P' || tag === 'DIV' || tag === 'BLOCKQUOTE' || tag === 'LI' || /^H[1-6]$/.test(tag)
  })

  return block?.tagName.toUpperCase() ?? null
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
