import { useCallback, useMemo } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { MutableRefObject } from 'react'
import { BASE_TOOLBAR_ACTIONS } from '../constants/toolbar-actions.constants'
import { editorElementToMarkdown } from '../richMarkdown'
import { execEditorCommand } from '../services/editor-command.service'
import type { ToolbarAction, ToolbarActionKey } from '../types'
import { getActiveBlockTag } from '../utils/editor-dom.utils'

type UseToolbarCommandsParams = {
  editorRef: MutableRefObject<HTMLDivElement | null>
  draftMarkdownRef: MutableRefObject<string>
  commitMarkdown: (nextMarkdown: string) => void
  onAiRewrite?: () => void
  aiToolbarLabel?: string
  aiToolbarTitle?: string
  onOpenLinkPopover: () => void
}

type UseToolbarCommandsResult = {
  toolbarActions: ToolbarAction[]
  syncEditorToMarkdown: () => void
  handleToolbarAction: (key: ToolbarActionKey) => void
  handleEditorKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}

export function useToolbarCommands({
  editorRef,
  draftMarkdownRef,
  commitMarkdown,
  onAiRewrite,
  aiToolbarLabel,
  aiToolbarTitle,
  onOpenLinkPopover,
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
