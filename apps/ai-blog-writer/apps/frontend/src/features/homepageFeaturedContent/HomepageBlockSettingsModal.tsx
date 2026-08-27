import { useEffect, useId, type ReactNode } from 'react'

type Props = {
  isOpen: boolean
  onClose: () => void
  /** Dialog heading (default: Block settings). */
  title?: string
  /** `aria-label` on the dialog (default: title). */
  ariaLabel?: string
  /** Sticky footer (e.g. Save + delete block). */
  footer?: ReactNode
  children: ReactNode
}

export default function HomepageBlockSettingsModal({
  isOpen,
  onClose,
  title = 'Block settings',
  ariaLabel,
  footer,
  children
}: Props) {
  const titleId = useId().replace(/:/g, '')

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const label = ariaLabel ?? title

  return (
    <div className="hf-modal-backdrop" onClick={onClose}>
      <div
        className="hf-modal hf-block-settings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className="hf-modal-top">
          <div className="hf-modal-title-row">
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              className="hf-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="hf-block-settings-modal-body" aria-labelledby={titleId}>
          {children}
        </div>
        {footer ? (
          <div className="hf-block-settings-modal-footer">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
