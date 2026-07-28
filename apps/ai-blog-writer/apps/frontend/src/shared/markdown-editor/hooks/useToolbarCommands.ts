import { useCallback, useMemo } from 'react'
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { MutableRefObject } from 'react'
import { BASE_TOOLBAR_ACTIONS } from '../constants/toolbar-actions.constants'
import { editorElementToMarkdown } from '../richMarkdown'
import { execEditorCommand } from '../services/editor-command.service'
import { matchMarkdownInputRule } from '../services/markdown-input-rules.service'
import { buildPasteInsertion } from '../services/paste.service'
import type { ToolbarAction, ToolbarActionKey } from '../types'
import {
  collapseSelectionTo,
  getActiveBlockElement,
  getActiveBlockTag,
  getRangeFromBlockStartToCaret,
  isCaretAtEndOfBlock,
} from '../utils/editor-dom.utils'

type UseToolbarCommandsParams = {
  editorRef: MutableRefObject<HTMLDivElement | null>
  draftMarkdownRef: MutableRefObject<string>
  commitMarkdown: (nextMarkdown: string) => void
  onAiRewrite?: () => void
  aiToolbarLabel?: string
  aiToolbarTitle?: string
  onOpenLinkPopover: () => void
  /** execCommand can change formatting without moving the caret, so the
   *  toolbar's pressed state has to be re-read explicitly afterwards. */
  onAfterCommand: () => void
}

type UseToolbarCommandsResult = {
  toolbarActions: ToolbarAction[]
  syncEditorToMarkdown: () => void
  handleToolbarAction: (key: ToolbarActionKey) => void
  handleEditorKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  handleEditorPaste: (event: ReactClipboardEvent<HTMLDivElement>) => void
}

export function useToolbarCommands({
  editorRef,
  draftMarkdownRef,
  commitMarkdown,
  onAiRewrite,
  aiToolbarLabel,
  aiToolbarTitle,
  onOpenLinkPopover,
  onAfterCommand,
}: UseToolbarCommandsParams): UseToolbarCommandsResult {
  const toolbarActions = useMemo(() => {
    if (!onAiRewrite) {
      return BASE_TOOLBAR_ACTIONS
    }

    return [
      ...BASE_TOOLBAR_ACTIONS,
      {
        key: 'ai' as const,
        label: aiToolbarLabel ?? 'AI',
        title: aiToolbarTitle ?? 'Rewrite this block with AI',
      },
    ]
  }, [onAiRewrite, aiToolbarLabel, aiToolbarTitle])

  const syncEditorToMarkdown = useCallback((): void => {
    const editor = editorRef.current
    if (!editor) return

    const nextMarkdown = editorElementToMarkdown(editor)
    if (nextMarkdown === draftMarkdownRef.current) return

    commitMarkdown(nextMarkdown)
  }, [commitMarkdown, draftMarkdownRef, editorRef])

  const toggleBlockFormat = useCallback(
    (tag: 'H2' | 'H3' | 'BLOCKQUOTE') => {
      const editor = editorRef.current
      if (!editor) return

      editor.focus()
      const activeTag = getActiveBlockTag(editor)
      const nextTag = activeTag === tag ? 'p' : tag.toLowerCase()
      execEditorCommand('formatBlock', nextTag)
    },
    [editorRef],
  )

  const handleToolbarAction = useCallback(
    (key: ToolbarActionKey) => {
      const editor = editorRef.current
      if (!editor) return

      if (key === 'ai') {
        onAiRewrite?.()
        return
      }

      if (key === 'link') {
        onOpenLinkPopover()
        return
      }

      editor.focus()
      switch (key) {
        case 'paragraph':
          execEditorCommand('formatBlock', 'p')
          break
        case 'h2':
          toggleBlockFormat('H2')
          break
        case 'h3':
          toggleBlockFormat('H3')
          break
        case 'quote':
          toggleBlockFormat('BLOCKQUOTE')
          break
        case 'bold':
          execEditorCommand('bold')
          break
        case 'italic':
          execEditorCommand('italic')
          break
        case 'bullets':
          execEditorCommand('insertUnorderedList')
          break
        case 'numbered':
          execEditorCommand('insertOrderedList')
          break
        default:
          break
      }
      syncEditorToMarkdown()
      onAfterCommand()
    },
    [editorRef, onAfterCommand, onAiRewrite, onOpenLinkPopover, syncEditorToMarkdown, toggleBlockFormat],
  )

  /**
   * Turns markdown shorthand typed at the start of a block into real structure.
   *
   * Without this the editor had no path from typing to formatting at all: the
   * markdown-to-HTML direction only ran on mount and on block switch, so `##
   * Title` sat in a paragraph as literal text and only became a heading once
   * the preview took over. Returns whether the space keypress was consumed.
   */
  const applyMarkdownInputRule = useCallback((): boolean => {
    const editor = editorRef.current
    if (!editor) return false

    const block = getActiveBlockElement(editor)
    // Inside a list item the same shorthand means "literal text", not "nest".
    if (!block || block.tagName.toUpperCase() === 'LI') return false

    const prefixRange = getRangeFromBlockStartToCaret(editor, block)
    if (!prefixRange) return false

    const rule = matchMarkdownInputRule(prefixRange.toString())
    if (!rule) return false

    prefixRange.deleteContents()
    collapseSelectionTo(prefixRange, true)

    switch (rule.type) {
      case 'heading':
        execEditorCommand('formatBlock', `h${rule.level}`)
        break
      case 'unordered-list':
        execEditorCommand('insertUnorderedList')
        break
      case 'ordered-list':
        execEditorCommand('insertOrderedList')
        break
      case 'blockquote':
        execEditorCommand('formatBlock', 'blockquote')
        break
    }

    return true
  }, [editorRef])

  /**
   * Enter at the end of a heading should start body copy. Browsers clone the
   * current block instead, so a heading begets another heading and the author
   * has to notice and undo it every single time.
   */
  const exitHeadingOnEnter = useCallback((): boolean => {
    const editor = editorRef.current
    if (!editor) return false

    const block = getActiveBlockElement(editor)
    if (!block || !/^H[1-6]$/.test(block.tagName.toUpperCase())) return false
    if (!isCaretAtEndOfBlock(editor, block)) return false

    execEditorCommand('insertParagraph')
    execEditorCommand('formatBlock', 'p')
    return true
  }, [editorRef])

  const handleEditorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const isMod = event.metaKey || event.ctrlKey

      if (!isMod && event.key === ' ') {
        if (applyMarkdownInputRule()) {
          event.preventDefault()
          syncEditorToMarkdown()
          onAfterCommand()
        }
        return
      }

      if (!isMod && event.key === 'Enter' && !event.shiftKey) {
        if (exitHeadingOnEnter()) {
          event.preventDefault()
          syncEditorToMarkdown()
          onAfterCommand()
        }
        return
      }

      if (!isMod) return

      const lowerKey = event.key.toLowerCase()
      if (lowerKey === 'b') {
        event.preventDefault()
        handleToolbarAction('bold')
        return
      }
      if (lowerKey === 'i') {
        event.preventDefault()
        handleToolbarAction('italic')
        return
      }
      if (lowerKey === 'k') {
        event.preventDefault()
        handleToolbarAction('link')
      }
    },
    [
      applyMarkdownInputRule,
      exitHeadingOnEnter,
      handleToolbarAction,
      onAfterCommand,
      syncEditorToMarkdown,
    ],
  )

  /**
   * Always intercepts. The clipboard's `text/html` flavour never reaches the
   * document, so no amount of foreign markup can get in, and a paste that
   * carries no text at all (an image, a file) inserts nothing rather than
   * planting an <img> the markdown serializer would silently drop.
   */
  const handleEditorPaste = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => {
      event.preventDefault()

      const insertion = buildPasteInsertion(event.clipboardData.getData('text/plain'))
      if (!insertion) return

      execEditorCommand(
        insertion.kind === 'html' ? 'insertHTML' : 'insertText',
        insertion.value,
      )
      syncEditorToMarkdown()
    },
    [syncEditorToMarkdown],
  )

  return {
    toolbarActions,
    syncEditorToMarkdown,
    handleToolbarAction,
    handleEditorKeyDown,
    handleEditorPaste,
  }
}
