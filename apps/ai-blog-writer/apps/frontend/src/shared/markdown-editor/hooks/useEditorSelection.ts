import { useCallback, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { normalizeLinkUrl } from '../richMarkdown'
import {
  findClosestElementWithinEditor,
  getSelectionRangeWithinEditor,
  restoreSelectionRange,
} from '../utils/editor-dom.utils'

type UseEditorSelectionParams = {
  editorRef: MutableRefObject<HTMLDivElement | null>
  syncEditorToMarkdownRef: MutableRefObject<() => boolean>
}

type UseEditorSelectionResult = {
  isLinkPopoverOpen: boolean
  linkUrlDraft: string
  linkPopoverError: string | null
  setLinkUrlDraft: (value: string) => void
  setLinkPopoverError: (value: string | null) => void
  setIsLinkPopoverOpen: (value: boolean) => void
  openLinkPopover: () => void
  applyLink: () => void
  removeLink: () => void
  resetSelectionUi: () => void
}

export function useEditorSelection({
  editorRef,
  syncEditorToMarkdownRef,
}: UseEditorSelectionParams): UseEditorSelectionResult {
  const savedSelectionRangeRef = useRef<Range | null>(null)
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false)
  const [linkUrlDraft, setLinkUrlDraft] = useState('https://')
  const [linkPopoverError, setLinkPopoverError] = useState<string | null>(null)

  const openLinkPopover = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()
    const range = getSelectionRangeWithinEditor(editor)
    if (!range || range.collapsed) {
      setLinkPopoverError('Select text first, then add the link.')
      setIsLinkPopoverOpen(true)
      return
    }

    savedSelectionRangeRef.current = range.cloneRange()
    const anchor = findClosestElementWithinEditor(range.startContainer, editor, (element) => element.tagName.toUpperCase() === 'A')
    const existingHref = anchor?.getAttribute('href') || 'https://'
    setLinkUrlDraft(existingHref)
    setLinkPopoverError(null)
    setIsLinkPopoverOpen(true)
  }, [editorRef])

  const applyLink = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const normalizedUrl = normalizeLinkUrl(linkUrlDraft)
    if (!normalizedUrl) {
      setLinkPopoverError('Enter a valid URL.')
      return
    }

    editor.focus()
    if (savedSelectionRangeRef.current) {
      restoreSelectionRange(savedSelectionRangeRef.current)
    }

    const activeRange = getSelectionRangeWithinEditor(editor)
    if (!activeRange || activeRange.collapsed) {
      setLinkPopoverError('Select text first, then add the link.')
      return
    }

    document.execCommand('createLink', false, normalizedUrl)
    const didApply = syncEditorToMarkdownRef.current()
    if (!didApply) return

    setLinkPopoverError(null)
    setIsLinkPopoverOpen(false)
    savedSelectionRangeRef.current = null
  }, [editorRef, linkUrlDraft, syncEditorToMarkdownRef])

  const removeLink = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()
    if (savedSelectionRangeRef.current) {
      restoreSelectionRange(savedSelectionRangeRef.current)
    }

    document.execCommand('unlink')
    syncEditorToMarkdownRef.current()
    setLinkPopoverError(null)
    setIsLinkPopoverOpen(false)
    savedSelectionRangeRef.current = null
  }, [editorRef, syncEditorToMarkdownRef])

  const resetSelectionUi = useCallback(() => {
    setIsLinkPopoverOpen(false)
    setLinkPopoverError(null)
    savedSelectionRangeRef.current = null
  }, [])

  return {
    isLinkPopoverOpen,
    linkUrlDraft,
    linkPopoverError,
    setLinkUrlDraft,
    setLinkPopoverError,
    setIsLinkPopoverOpen,
    openLinkPopover,
    applyLink,
    removeLink,
    resetSelectionUi,
  }
}
