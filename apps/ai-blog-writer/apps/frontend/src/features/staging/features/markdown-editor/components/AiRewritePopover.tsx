type AiRewritePopoverProps = {
  isOpen: boolean
  aiPromptDraft: string
  isAiRewriting: boolean
  includeWholeArticleContext: boolean
  onPromptChange: (value: string) => void
  onToggleWholeArticleContext: (value: boolean) => void
  onRunRewrite: () => Promise<void>
  onClose: () => void
}

export function AiRewritePopover({
  isOpen,
  aiPromptDraft,
  isAiRewriting,
  includeWholeArticleContext,
  onPromptChange,
  onToggleWholeArticleContext,
  onRunRewrite,
  onClose,
}: AiRewritePopoverProps) {
  if (!isOpen) return null

  return (
    <div className="block-markdown-ai-popover">
      <div className="block-markdown-ai-row">
        <input
          type="text"
          className="block-markdown-ai-input"
          value={aiPromptDraft}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void onRunRewrite()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
          placeholder="Tell AI what to change in this block..."
        />
        <button
          type="button"
          className="block-markdown-ai-btn"
          onClick={() => {
            void onRunRewrite()
          }}
          disabled={isAiRewriting}
        >
          {isAiRewriting ? 'Rewriting...' : 'Rewrite'}
        </button>
        <button type="button" className="block-markdown-ai-btn subtle" onClick={onClose} disabled={isAiRewriting}>
          Cancel
        </button>
      </div>
      <label className="block-markdown-ai-context-toggle">
        <input
          type="checkbox"
          checked={includeWholeArticleContext}
          onChange={(event) => onToggleWholeArticleContext(event.target.checked)}
          disabled={isAiRewriting}
        />
        Include whole article as context
      </label>
    </div>
  )
}
