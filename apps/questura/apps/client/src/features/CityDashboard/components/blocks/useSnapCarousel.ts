'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Paged arrow/dot navigation for a horizontal scroll-snap carousel.
 *
 * Pages are the reachable scroll positions, not the item count: the scroll
 * position clamps at scrollWidth - clientWidth, so once the trailing items fit
 * inside the viewport they can't become left-aligned pages of their own.
 * Navigating per item would leave the next arrow enabled at the end of the
 * list, with the last presses only nudging the row a few pixels.
 *
 * The final page always lands exactly at the end of the scroll range, and a
 * second-to-last stop closer than half a step to the end is merged into it.
 *
 * Cards are read from the scroll container's element children; decorative
 * children (e.g. trailing spacers) must carry aria-hidden to be skipped.
 */
export function useSnapCarousel(itemCount: number) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<number[]>([])
  const [pageCount, setPageCount] = useState(0)
  const [activePage, setActivePage] = useState(0)

  const syncPages = useCallback((): number[] => {
    const container = scrollRef.current
    if (!container) return []

    const maxScroll = container.scrollWidth - container.clientWidth
    const paddingLeft = parseFloat(getComputedStyle(container).paddingLeft) || 0
    const stops: number[] = []
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement) || child.hasAttribute('aria-hidden')) continue
      stops.push(child.offsetLeft - paddingLeft)
    }

    let pages: number[]
    if (stops.length === 0) {
      pages = []
    } else if (maxScroll <= 0) {
      pages = [0]
    } else {
      const step = stops.length > 1 ? stops[1] - stops[0] : maxScroll
      pages = stops.filter((stop) => stop < maxScroll)
      if (pages.length > 0 && maxScroll - pages[pages.length - 1] < step / 2) {
        pages[pages.length - 1] = maxScroll
      } else {
        pages.push(maxScroll)
      }
    }

    pagesRef.current = pages
    setPageCount(pages.length)
    return pages
  }, [])

  const scrollToPage = useCallback(
    (page: number) => {
      const container = scrollRef.current
      if (!container) return
      const pages = pagesRef.current.length > 0 ? pagesRef.current : syncPages()
      if (pages.length === 0) return
      const clamped = Math.max(0, Math.min(pages.length - 1, page))
      container.scrollTo({ left: pages[clamped], behavior: 'smooth' })
      setActivePage(clamped)
    },
    [syncPages],
  )

  const scrollByPage = useCallback(
    (direction: -1 | 1) => {
      scrollToPage(activePage + direction)
    },
    [activePage, scrollToPage],
  )

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    syncPages()

    const handleScroll = () => {
      const pages = pagesRef.current
      if (pages.length === 0) return
      const { scrollLeft } = container
      let nearest = 0
      for (let i = 1; i < pages.length; i += 1) {
        if (Math.abs(pages[i] - scrollLeft) < Math.abs(pages[nearest] - scrollLeft)) {
          nearest = i
        }
      }
      setActivePage(nearest)
    }

    // Card widths are breakpoint-based, so page positions change with the
    // container size.
    const resizeObserver = new ResizeObserver(() => {
      syncPages()
      handleScroll()
    })
    resizeObserver.observe(container)
    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      resizeObserver.disconnect()
      container.removeEventListener('scroll', handleScroll)
    }
  }, [syncPages, itemCount])

  return { scrollRef, pageCount, activePage, scrollToPage, scrollByPage }
}
