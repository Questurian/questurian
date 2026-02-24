type LinkPopoverProps = {
  isOpen: boolean
  linkUrlDraft: string
  onLinkUrlDraftChange: (value: string) => void
  onApply: () => void
  onRemove: () => void
  onClose: () => void
}

export function LinkPopover({
  isOpen,
  linkUrlDraft,
  onLinkUrlDraftChange,
  onApply,
  onRemove,
  onClose,
}: LinkPopoverProps) {
  if (!isOpen) return null

  return (
    <div className="block-markdown-link-popover">
      <input
        type="text"
        className="block-markdown-link-input"
        value={linkUrlDraft}
        onChange={(event) => onLinkUrlDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onApply()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
        placeholder="https://example.com"
      />
      <button type="button" className="block-markdown-link-btn" onClick={onApply}>
        Apply
      </button>
      <button type="button" className="block-markdown-link-btn subtle" onClick={onRemove}>
        Remove
      </button>
      <button type="button" className="block-markdown-link-btn subtle" onClick={onClose}>
        Cancel
      </button>
    </div>
  )
}
