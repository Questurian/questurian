'use client'

import type { JSX } from 'react'
import { useCallback, useEffect, useId, useState } from 'react'
import { X } from 'lucide-react'

const triggerLinkClass =
  'maps-listicle-info-label break-words text-left text-[12px] font-light leading-tight text-foreground/72 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none 480:text-[13px] sm:text-[14px]'

export type ItineraryDetailRow = {
  key: string
  icon: JSX.Element
  label: string
  value: string
}

export function ItineraryDetailsModal({
  venueTitle,
  heading,
  rows,
  finePrint,
}: {
  venueTitle: string
  heading: string
  rows: ItineraryDetailRow[]
  finePrint: string[]
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const dialogId = useId()

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, close])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerLinkClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
      >
        Show Amenities and Details
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close"
            onClick={close}
          />
          <div
            id={dialogId}
            className="relative z-[101] flex max-h-[min(85dvh,32rem)] w-full max-w-md flex-col rounded-t-lg bg-background shadow-lg sm:max-h-[85vh] sm:rounded-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-foreground/10 px-4 py-3">
              <h2
                id={titleId}
                className="pr-2 font-display text-[1.05rem] font-semibold leading-tight text-foreground"
              >
                {heading} · {venueTitle}
              </h2>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-sm p-1 text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
                aria-label={`Close ${heading.toLowerCase()}`}
              >
                <X className="size-5" strokeWidth={1.75} />
              </button>
            </div>
            <ul className="m-0 min-h-0 flex-1 list-none space-y-0 overflow-y-auto overscroll-contain p-0">
              {rows.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center gap-3 border-b border-foreground/08 px-4 py-2.5 last:border-b-0"
                >
                  <span>{row.icon}</span>
                  <span className="min-w-0 flex-1 text-[12px] font-semibold text-[var(--maps-listicle-accent)]">
                    {row.label}
                  </span>
                  <span className="max-w-[60%] text-right text-[12px] leading-snug text-foreground/90">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
            {finePrint.length > 0 ? (
              <p className="shrink-0 border-t border-foreground/10 px-4 py-3 text-[10px] font-medium leading-snug tracking-[0.02em] text-foreground/40 480:text-[11px]">
                {finePrint.join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
