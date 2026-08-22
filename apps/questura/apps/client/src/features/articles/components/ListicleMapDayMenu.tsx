'use client'

import { useRef, useState, type JSX } from 'react'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { useListicleMapSync } from '@/features/articles/components/ListicleMapSync'
import { useMenuDismiss } from '@/features/articles/lib/useMenuDismiss'

/**
 * Day switcher for multi-day itineraries, on the map itself.
 *
 * The article's day tabs are sticky chrome at the top of the reading column,
 * which the phone's map takeover covers - so without this the map is stuck on
 * whichever day the reader left behind. It drives the same state the tabs do,
 * so switching here moves the article too.
 *
 * A menu rather than a row of tabs: a seven-day itinerary would otherwise put
 * seven buttons across a map that is mostly there to be looked at.
 */
export function ListicleMapDayMenu(): JSX.Element | null {
  const { days } = useListicleMapSync()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useMenuDismiss(open, () => setOpen(false), rootRef)

  if (!days || days.labels.length < 2) return null

  const current = days.labels[days.activeIndex] ?? days.labels[0]

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-1.5 rounded-full border border-foreground/15 bg-paper/95 pl-3 pr-2.5 text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-foreground/70 shadow-[0_4px_14px_rgba(26,26,26,0.16)] transition-colors hover:text-accent 1024:h-9"
      >
        <CalendarDays className="size-[15px] shrink-0" aria-hidden="true" />
        {current}
        <ChevronDown
          className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Itinerary days"
          className="absolute left-0 top-[calc(100%+8px)] z-20 max-h-[60vh] w-[172px] overflow-y-auto overscroll-contain rounded-xl border border-foreground/15 bg-paper p-1.5 shadow-[0_10px_30px_rgba(26,26,26,0.22)]"
        >
          {days.labels.map((label, index) => {
            const selected = index === days.activeIndex
            return (
              <button
                key={label}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  days.select(index)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold uppercase leading-none tracking-[0.12em] transition-colors ${
                  selected
                    ? 'bg-paper-accent text-foreground'
                    : 'text-foreground/60 hover:text-foreground'
                }`}
              >
                <Check
                  className={`size-3.5 shrink-0 text-accent ${selected ? '' : 'opacity-0'}`}
                  aria-hidden="true"
                />
                {label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
