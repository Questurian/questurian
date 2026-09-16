import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A modal that behaves like one.
 *
 * Focus moves in on open, cannot leave while it is open, and returns to
 * whatever opened it on close — which matters here because every dialog on this
 * screen is reached from a specific row or button the operator was working on,
 * and landing back at the top of the page loses their place.
 *
 * Escape closes. The backdrop does too, but only on the backdrop itself: a
 * drag that starts inside the panel and ends outside it must not be read as a
 * click on the backdrop.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface DialogProps {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  /** Widen for side-by-side comparisons such as a layout preview. */
  wide?: boolean
  /** A panel on the right edge, for reference the operator glances at and closes. */
  drawer?: boolean
}

export function Dialog({ title, description, onClose, children, footer, wide, drawer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    // A drawer is read from the top; focusing its first field would scroll
    // past the part that says what it is.
    const first = drawer ? null : panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()
    return () => returnFocusRef.current?.focus?.()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        element => element.offsetParent !== null || element === document.activeElement,
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div
      className={drawer ? 'ip-backdrop ip-backdrop-drawer' : 'ip-backdrop'}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={drawer ? 'ip-dialog ip-drawer' : wide ? 'ip-dialog ip-dialog-wide' : 'ip-dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ip-dialog-title"
        aria-describedby={description ? 'ip-dialog-description' : undefined}
        ref={panelRef}
        tabIndex={-1}
      >
        <h2 className="ip-dialog-title" id="ip-dialog-title">
          {title}
        </h2>
        {description ? (
          <p className="ip-dialog-description" id="ip-dialog-description">
            {description}
          </p>
        ) : null}
        <div className="ip-dialog-body">{children}</div>
        <div className="ip-dialog-footer">{footer}</div>
      </div>
    </div>
  )
}
