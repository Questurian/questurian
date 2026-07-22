'use client'

import type { JSX } from 'react'
import { useCallback, useEffect, useId, useState } from 'react'
import { X } from 'lucide-react'
import {
  areListicleHoursAlwaysOpen,
  type ListicleHoursRow,
} from '@/features/articles/lib/listicleVenueFormatters'

const labelClass = 'maps-listicle-info-label break-words text-left text-[12px] font-light leading-tight text-foreground/72 480:text-[13px] sm:text-[14px]'
const linkClass = `${labelClass} hover:text-foreground focus-visible:text-foreground focus-visible:outline-none`

type ListicleHoursModalTriggerProps = {
  venueTitle: string
  rows: ListicleHoursRow[]
}

export function ListicleHoursModalTrigger({
  venueTitle,
  rows,
}: ListicleHoursModalTriggerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const dialogId = useId()
  const alwaysOpen = areListicleHoursAlwaysOpen(rows)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, close])

  if (alwaysOpen) {
    return <span className={labelClass}>Always Open</span>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={linkClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
      >
        See hours
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
                className="font-display text-[1.05rem] font-semibold leading-tight text-foreground pr-2"
              >
                Hours · {venueTitle}
              </h2>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-sm p-1 text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
                aria-label="Close hours"
              >
                <X className="size-5" strokeWidth={1.75} />
              </button>
            </div>
            <ul className="min-h-0 flex-1 list-none space-y-0 overflow-y-auto overscroll-contain p-0 m-0">
              {rows.map((r, i) => (
                <li
                  key={`${i}-${r.day}`}
                  className="flex gap-3 border-b border-foreground/08 px-4 py-2.5 last:border-b-0"
                >
                  <span className="w-[5.5rem] shrink-0 text-[12px] font-semibold capitalize text-[var(--maps-listicle-accent)]">
                    {r.day}
                  </span>
                  <span className="min-w-0 flex-1 text-[12px] leading-snug text-foreground/90">
                    {r.hours}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  )
}
