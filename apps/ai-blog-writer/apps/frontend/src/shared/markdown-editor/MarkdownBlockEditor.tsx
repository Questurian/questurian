import { useCallback, useRef } from 'react'
import { AiRewritePopover } from './components/AiRewritePopover'
import { EditorToolbar } from './components/EditorToolbar'
import { LinkPopover } from './components/LinkPopover'
import { RichContentEditable } from './components/RichContentEditable'
import { useAiRewrite } from './hooks/useAiRewrite'
import { useEditorSelection } from './hooks/useEditorSelection'
import { useHeadingStructureGuard } from './hooks/useHeadingStructureGuard'
import { useMarkdownEditorState } from './hooks/useMarkdownEditorState'
import { useToolbarCommands } from './hooks/useToolbarCommands'
import type { MarkdownBlockEditorProps } from './types'
import { resizeTextareaToContent } from './utils/editor-dom.utils'

export function MarkdownBlockEditor({
  blockId,
  value,
  onChange,
  showToolbar = true,
  enforceHeadingStructure = false,
  onAiRewrite,
  aiToolbarLabel,
  aiToolbarTitle,
  className = 'block-textarea',
  rows = 6,
  placeholder = '',
  ariaLabel,
}: MarkdownBlockEditorProps) {
  const resetTransientRef = useRef<() => void>(() => {})

  const state = useMarkdownEditorState({
    blockId,
    value,
    showToolbar,
    onChange,
    onResetTransient: () => resetTransientRef.current(),
  })

  const heading = useHeadingStructureGuard({
    value,
    enforceHeadingStructure,
  })

  const syncEditorToMarkdownRef = useRef<() => void>(() => {})

  const selection = useEditorSelection({
    editorRef: state.editorRef,
    syncEditorToMarkdownRef,
  })

  const ai = useAiRewrite({
    blockId,
    onAiRewrite,
    draftMarkdownRef: state.draftMarkdownRef,
    editorRef: state.editorRef,
    commitMarkdown: state.commitMarkdown,
  })

  const openAiRewritePrompt = useCallback(() => {
    selection.setIsLinkPopoverOpen(false)
    selection.setLinkPopoverError(null)
    ai.openAiRewritePrompt()
  }, [ai, selection])

  const toolbar = useToolbarCommands({
    editorRef: state.editorRef,
    draftMarkdownRef: state.draftMarkdownRef,
    commitMarkdown: state.commitMarkdown,
    onOpenLinkPopover: selection.openLinkPopover,
    onAiRewrite: onAiRewrite ? openAiRewritePrompt : undefined,
    aiToolbarLabel,
    aiToolbarTitle,
  })

  syncEditorToMarkdownRef.current = toolbar.syncEditorToMarkdown
  resetTransientRef.current = () => {
    selection.resetSelectionUi()
    ai.resetAiUi()
  }

  if (!state.isRichEditor) {
    return (
      <textarea
        ref={state.setPlainTextareaRef}
        className={className}
        value={value}
        onChange={(event) => state.commitMarkdown(event.target.value)}
        onInput={(event) => resizeTextareaToContent(event.currentTarget)}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    )
  }

  return (
    <div className="block-markdown-editor-shell">
      <EditorToolbar blockId={blockId} actions={toolbar.toolbarActions} onAction={toolbar.handleToolbarAction} />

      {/* One structure line: the warning supersedes the hint rather than stacking on it. */}
      {heading.headingStructureWarning ? (
        <p className="block-markdown-hint warning">{heading.headingStructureWarning}</p>
      ) : heading.headingStructureHint ? (
        <p className="block-markdown-hint">{heading.headingStructureHint}</p>
      ) : null}

      <LinkPopover
        isOpen={selection.isLinkPopoverOpen}
        linkUrlDraft={selection.linkUrlDraft}
        onLinkUrlDraftChange={selection.setLinkUrlDraft}
        onApply={selection.applyLink}
        onRemove={selection.removeLink}
        onClose={() => {
          selection.setIsLinkPopoverOpen(false)
          selection.setLinkPopoverError(null)
        }}
      />

      <AiRewritePopover
        isOpen={ai.isAiPromptOpen}
        aiPromptDraft={ai.aiPromptDraft}
        isAiRewriting={ai.isAiRewriting}
        includeWholeArticleContext={ai.includeWholeArticleContext}
        onPromptChange={ai.setAiPromptDraft}
        onToggleWholeArticleContext={ai.setIncludeWholeArticleContext}
        onRunRewrite={ai.runAiRewrite}
        onClose={() => {
          ai.setIsAiPromptOpen(false)
          ai.setAiRewriteError(null)
        }}
      />

      {selection.linkPopoverError ? <p className="block-markdown-hint error">{selection.linkPopoverError}</p> : null}
      {ai.aiRewriteError ? <p className="block-markdown-hint error">{ai.aiRewriteError}</p> : null}

      <RichContentEditable
        editorRef={state.editorRef}
        isEditorEmpty={state.isEditorEmpty}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        onInput={toolbar.syncEditorToMarkdown}
        onKeyDown={toolbar.handleEditorKeyDown}
      />
    </div>
  )
}
