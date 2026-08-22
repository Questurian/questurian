'use client'

import type { JSX } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useListicleMapSync } from '@/features/articles/components/ListicleMapSync'

/**
 * Prev/next arrows sitting on the map, walking the stops in list order.
 *
 * Stepping goes through `scrollToEntry` rather than moving the camera on its
 * own, so the article column, the active marker and the camera stay one
 * thing - the arrows are a second way to do what clicking a pin does.
 *
 * Positioned by the chrome cluster in MapPanel, which anchors top-right:
 * the bottom of the map is where the phone floats its venue card and mode
 * switch.
 */
export function ListicleMapStepper(): JSX.Element | null {
  const { points, activeId, scrollToEntry } = useListicleMapSync()

  if (points.length < 2) return null

  const index = points.findIndex((point) => point.id === activeId)
  // No active stop means the reader is above the list looking at every pin;
  // forward starts the walk, back has nowhere to go.
  const previous = index > 0 ? points[index - 1] : null
  const next = index < 0 ? points[0] : points[index + 1]

  const buttonClass =
    'flex size-10 items-center justify-center text-foreground/70 transition-colors hover:text-accent disabled:text-foreground/25 1024:size-9'

  return (
    <div
      role="group"
      aria-label="Step through places"
      className="pointer-events-auto flex items-center overflow-hidden rounded-full border border-foreground/15 bg-paper/95 shadow-[0_4px_14px_rgba(26,26,26,0.16)]"
    >
      <button
        type="button"
        aria-label="Previous place"
        disabled={!previous}
        onClick={() => previous && scrollToEntry(previous.id)}
        className={buttonClass}
      >
        <ChevronLeft className="size-[18px]" aria-hidden="true" />
      </button>
      <span aria-hidden="true" className="h-4 w-px bg-foreground/15" />
      <button
        type="button"
        aria-label="Next place"
        disabled={!next}
        onClick={() => next && scrollToEntry(next.id)}
        className={buttonClass}
      >
        <ChevronRight className="size-[18px]" aria-hidden="true" />
      </button>
    </div>
  )
}
