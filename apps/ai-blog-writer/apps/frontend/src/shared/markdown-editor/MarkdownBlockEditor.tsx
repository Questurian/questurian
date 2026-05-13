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
    blockId,
    value,
    enforceHeadingStructure,
    draftMarkdownRef: state.draftMarkdownRef,
    commitMarkdown: state.commitMarkdown,
  })

  const syncEditorToMarkdownRef = useRef<() => boolean>(() => true)

  const selection = useEditorSelection({
    editorRef: state.editorRef,
    syncEditorToMarkdownRef,
  })

  const ai = useAiRewrite({
    blockId,
    onAiRewrite,
    draftMarkdownRef: state.draftMarkdownRef,
    editorRef: state.editorRef,
    applyValueWithHeadingGuard: heading.applyValueWithHeadingGuard,
  })

  const openAiRewritePrompt = useCallback(() => {
    selection.setIsLinkPopoverOpen(false)
    selection.setLinkPopoverError(null)
    ai.openAiRewritePrompt()
  }, [ai, selection])

  const toolbar = useToolbarCommands({
    editorRef: state.editorRef,
    draftMarkdownRef: state.draftMarkdownRef,
    applyValueWithHeadingGuard: heading.applyValueWithHeadingGuard,
    onOpenLinkPopover: selection.openLinkPopover,
    onAiRewrite: onAiRewrite ? openAiRewritePrompt : undefined,
  })

  syncEditorToMarkdownRef.current = toolbar.syncEditorToMarkdown
  resetTransientRef.current = () => {
    heading.setHeadingRestrictionMessage(null)
    selection.resetSelectionUi()
    ai.resetAiUi()
  }

  if (!state.isRichEditor) {
    return (
      <textarea
        ref={state.setPlainTextareaRef}
        className={className}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value
          heading.setHeadingRestrictionMessage(null)
          state.commitMarkdown(nextValue)
        }}
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

      {heading.headingStructureHint ? <p className="block-markdown-hint">{heading.headingStructureHint}</p> : null}

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
      {heading.headingRestrictionMessage ? (
        <p className="block-markdown-hint error">{heading.headingRestrictionMessage}</p>
      ) : null}

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
