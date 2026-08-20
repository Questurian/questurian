'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Sticky wrapper for a sidebar rail that may be taller than the viewport.
 *
 * A plain `top` pin would park the rail under the navbar and leave everything
 * past the fold permanently out of view; a `bottom` pin never engages at all,
 * because a sticky box taller than the scrollport gets clamped to the top of
 * its containing block. So we measure the rail and pin it at
 * `min(<navbar offset>, 100vh - height - gap)`:
 *   - rail shorter than the viewport -> normal top pin below the navbar.
 *   - rail taller  -> negative offset, so it scrolls up with the article until
 *     its bottom edge reaches the viewport bottom, then holds there.
 * Either way it releases at the end of the containing grid cell (the body).
 */
export function StickyRail({
  children,
  className,
  topOffsetRem = 6,
  gapRem = 2,
}: {
  children: ReactNode
  className?: string
  topOffsetRem?: number
  gapRem?: number
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(`${topOffsetRem}rem`)

  useEffect(() => {
    const el = railRef.current
    if (!el) return

    const update = () => {
      setTop(
        `min(${topOffsetRem}rem, calc(100dvh - ${el.offsetHeight}px - ${gapRem}rem))`,
      )
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [topOffsetRem, gapRem])

  return (
    <div ref={railRef} className={className} style={{ top }}>
      {children}
    </div>
  )
}
