import { useCallback, useMemo } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { MutableRefObject } from 'react'
import { BASE_TOOLBAR_ACTIONS } from '../constants/toolbar-actions.constants'
import { editorElementToMarkdown, markdownToEditorHtml } from '../richMarkdown'
import { execEditorCommand } from '../services/editor-command.service'
import type { ToolbarAction, ToolbarActionKey } from '../types'
import { getActiveBlockTag, placeCaretAtEnd } from '../utils/editor-dom.utils'

type UseToolbarCommandsParams = {
  editorRef: MutableRefObject<HTMLDivElement | null>
  draftMarkdownRef: MutableRefObject<string>
  applyValueWithHeadingGuard: (nextValue: string) => boolean
  onAiRewrite?: () => void
  onOpenLinkPopover: () => void
}

type UseToolbarCommandsResult = {
  toolbarActions: ToolbarAction[]
  syncEditorToMarkdown: () => boolean
  handleToolbarAction: (key: ToolbarActionKey) => void
  handleEditorKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}

export function useToolbarCommands({
  editorRef,
  draftMarkdownRef,
  applyValueWithHeadingGuard,
  onAiRewrite,
  onOpenLinkPopover,
}: UseToolbarCommandsParams): UseToolbarCommandsResult {
  const toolbarActions = useMemo(() => {
    if (!onAiRewrite) {
      return BASE_TOOLBAR_ACTIONS
    }

    return [...BASE_TOOLBAR_ACTIONS, { key: 'ai' as const, label: 'AI', title: 'Rewrite this block with AI' }]
  }, [onAiRewrite])

  const syncEditorToMarkdown = useCallback((): boolean => {
    const editor = editorRef.current
    if (!editor) return false

    const nextMarkdown = editorElementToMarkdown(editor)
    if (nextMarkdown === draftMarkdownRef.current) return true

    const didApply = applyValueWithHeadingGuard(nextMarkdown)
    if (!didApply) {
      editor.innerHTML = markdownToEditorHtml(draftMarkdownRef.current)
      placeCaretAtEnd(editor)
    }
    return didApply
  }, [applyValueWithHeadingGuard, draftMarkdownRef, editorRef])

  const toggleBlockFormat = useCallback(
    (tag: 'H2' | 'H3' | 'BLOCKQUOTE') => {
      const editor = editorRef.current
      if (!editor) return

      editor.focus()
      const activeTag = getActiveBlockTag(editor)
      const nextTag = activeTag === tag ? 'p' : tag.toLowerCase()
      execEditorCommand('formatBlock', nextTag)
      syncEditorToMarkdown()
    },
    [editorRef, syncEditorToMarkdown],
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
        case 'h2':
          toggleBlockFormat('H2')
          return
        case 'h3':
          toggleBlockFormat('H3')
          return
        case 'quote':
          toggleBlockFormat('BLOCKQUOTE')
          return
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
        case 'ai':
        case 'link':
          return
        default:
          break
      }
      syncEditorToMarkdown()
    },
    [editorRef, onAiRewrite, onOpenLinkPopover, syncEditorToMarkdown, toggleBlockFormat],
  )

  const handleEditorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const isMod = event.metaKey || event.ctrlKey
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
    [handleToolbarAction],
  )

  return {
    toolbarActions,
    syncEditorToMarkdown,
    handleToolbarAction,
    handleEditorKeyDown,
  }
}
