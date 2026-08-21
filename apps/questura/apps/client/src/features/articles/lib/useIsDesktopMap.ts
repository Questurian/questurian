'use client'

import { useEffect, useState } from 'react'

/** Matches the 1024 breakpoint the two-column listicle layout switches on. */
export const DESKTOP_MAP_QUERY = '(min-width: 1024px)'

/**
 * Whether the side-by-side map column should exist at all.
 *
 * Starts false and only turns true once the browser has answered, because a
 * CSS-hidden map column still mounts MapPanel, and MapPanel instantiates a
 * real `google.maps.Map` - a billed dynamic map load on phones that can never
 * see it. Desktop pays a frame of delay, which is invisible next to the async
 * Maps JS download.
 */
export function useIsDesktopMap(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_MAP_QUERY)
    const sync = () => setIsDesktop(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return isDesktop
}
