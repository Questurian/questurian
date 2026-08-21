'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type JSX,
  type ReactNode,
} from 'react'
import {
  initialListicleMapNavigationState,
  listicleMapNavigationReducer,
} from '@/features/articles/components/ListicleMapNavigation'
import { DESKTOP_MAP_QUERY } from '@/features/articles/lib/useIsDesktopMap'

/**
 * Bottom edge of whatever is pinned to the top of the page: the navbar,
 * plus any sticky article chrome that opts in with the data attribute (the
 * itinerary day tabs).
 *
 * Measured live rather than captured once, because the navbar shrinks as the
 * page scrolls - a value taken before a smooth scroll is stale by the time
 * that scroll lands.
 */
function stickyChromeBottom(): number {
  const declared = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--navbar-height'),
  )
  let bottom = Number.isFinite(declared) ? declared : 0
  for (const el of document.querySelectorAll('[data-listicle-sticky-chrome]')) {
    bottom += el.getBoundingClientRect().height
  }
  return bottom
}

const READING_BAND_TOP = 0.35
const READING_BAND_BOTTOM = 0.45
/** Desktop drops the target into the reading band, not against the chrome. */
const NAVIGATION_TOP = 0.18
const SCROLL_SETTLE_MS = 140
const SCROLL_FALLBACK_MS = 2000
const SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' ',
])

/** Card fields the mobile map takeover shows for the active stop. */
export type ListicleMapPointPreview = {
  address: string | null
  excerpt: string | null
  image: { url: string; alt: string } | null
}

export type ListicleMapPoint = {
  /** Listicle row id - rows can share a venue, so keys must come from the row. */
  id: string
  index: number
  title: string
  lat: number
  lng: number
  /** 'stay' pins render a house glyph instead of the entry number. */
  kind?: 'stay' | 'stop'
  /** Absent on desktop, where the reading column is already beside the map. */
  preview?: ListicleMapPointPreview
}

type ListicleMapSyncValue = {
  points: ListicleMapPoint[]
  activeId: string | null
  registerEntry: (id: string, el: HTMLElement | null) => void
  scrollToEntry: (id: string) => void
}

const ListicleMapSyncContext = createContext<ListicleMapSyncValue>({
  points: [],
  activeId: null,
  registerEntry: () => {},
  scrollToEntry: () => {},
})

// The workspace hoists a second @types/react copy, which makes TS reject
// Provider's ProviderExoticComponent type as a JSX element; alias it to a
// plain component signature (identical at runtime).
const MapSyncProvider = ListicleMapSyncContext.Provider as unknown as (props: {
  value: ListicleMapSyncValue
  children: ReactNode
}) => JSX.Element

export function useListicleMapSync(): ListicleMapSyncValue {
  return useContext(ListicleMapSyncContext)
}

function entryInReadingBand(elementsById: Map<string, HTMLElement>): string | null {
  const bandTop = window.innerHeight * READING_BAND_TOP
  const bandBottom = window.innerHeight * READING_BAND_BOTTOM
  let nextId: string | null = null
  let nextTop = Infinity

  for (const [id, el] of elementsById) {
    const rect = el.getBoundingClientRect()
    if (rect.bottom <= bandTop || rect.top >= bandBottom) continue
    if (rect.top < nextTop) {
      nextTop = rect.top
      nextId = id
    }
  }

  return nextId
}

/**
 * Tracks which listicle entry sits in a band around the viewport center and
 * exposes it as `activeId` so the map can follow the reader. No entry in the
 * band (e.g. the article header at the top of the page) means `activeId` is
 * null - the map shows the wide all-pins view.
 */
export function ListicleMapSyncProvider({
  points,
  children,
}: {
  points: ListicleMapPoint[]
  children: ReactNode
}): JSX.Element {
  const [{ activeId }, dispatchNavigation] = useReducer(
    listicleMapNavigationReducer,
    initialListicleMapNavigationState,
  )
  const observerRef = useRef<IntersectionObserver | null>(null)
  const elementsById = useRef(new Map<string, HTMLElement>())
  const idsByElement = useRef(new Map<Element, string>())
  const inBand = useRef(new Set<string>())
  const navigationCleanup = useRef<(() => void) | null>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = idsByElement.current.get(entry.target)
          if (!id) continue
          if (entry.isIntersecting) inBand.current.add(id)
          else inBand.current.delete(id)
        }

        let nextId: string | null = null
        let nextTop = Infinity
        for (const id of inBand.current) {
          const el = elementsById.current.get(id)
          if (!el) continue
          const top = el.getBoundingClientRect().top
          if (top < nextTop) {
            nextTop = top
            nextId = id
          }
        }
        // Nothing in the band is ambiguous: the reader is either above the
        // list entirely (map should show every pin) or passing through a gap
        // between entries - an ad slot, a separator, a tall photo - where the
        // map must hold its place. Distinguish them by asking whether every
        // entry still sits below the band.
        let aboveList = false
        if (nextId === null) {
          const bandBottom = window.innerHeight * READING_BAND_BOTTOM
          let topmost = Infinity
          for (const el of elementsById.current.values()) {
            const top = el.getBoundingClientRect().top
            if (top < topmost) topmost = top
          }
          aboveList = topmost === Infinity || topmost > bandBottom
        }

        dispatchNavigation({ type: 'observe', id: nextId, aboveList })
      },
      // Band from 35% to 45% of viewport height: the entry crossing it is
      // the one the reader is looking at.
      { rootMargin: '-35% 0px -55% 0px', threshold: 0 },
    )

    observerRef.current = observer
    for (const el of elementsById.current.values()) observer.observe(el)

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [])

  const registerEntry = useCallback((id: string, el: HTMLElement | null) => {
    const previous = elementsById.current.get(id)
    if (previous === el) return
    if (previous) {
      observerRef.current?.unobserve(previous)
      idsByElement.current.delete(previous)
      elementsById.current.delete(id)
      inBand.current.delete(id)
    }
    if (el) {
      elementsById.current.set(id, el)
      idsByElement.current.set(el, id)
      observerRef.current?.observe(el)
    }
  }, [])

  const scrollToEntry = useCallback((id: string) => {
    const el = elementsById.current.get(id)
    if (!el) return

    navigationCleanup.current?.()
    dispatchNavigation({ type: 'navigate', id })

    /**
     * On a phone the map sits in a sheet over the lower half, so the reading
     * band is a thin strip under the chrome. Landing an entry at 18% of the
     * viewport would put its rule mid-strip and push the photo and venue name
     * out of sight, so mobile aligns the entry's top rule flush against the
     * chrome and gets the whole card. Desktop reads beside a full-height map
     * and keeps the roomier band position.
     */
    const desiredTop = () =>
      window.matchMedia(DESKTOP_MAP_QUERY).matches
        ? window.innerHeight * NAVIGATION_TOP
        : stickyChromeBottom()

    const top = window.scrollY + el.getBoundingClientRect().top - desiredTop()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const alreadyAligned = Math.abs(el.getBoundingClientRect().top - desiredTop()) <= 2
    let done = false
    let settleTimer: number | null = null
    let fallbackTimer: number | null = null

    const cleanup = () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('wheel', handleUserInterrupt)
      window.removeEventListener('touchstart', handleUserInterrupt)
      window.removeEventListener('keydown', handleKeyDown)
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
      if (navigationCleanup.current === cancel) navigationCleanup.current = null
    }

    const release = (alignTarget: boolean) => {
      if (done) return
      done = true
      cleanup()

      const currentTarget = elementsById.current.get(id)
      if (alignTarget && currentTarget) {
        const correction = currentTarget.getBoundingClientRect().top - desiredTop()
        if (Math.abs(correction) > 2) {
          window.scrollBy({ top: correction, behavior: 'auto' })
        }
      }

      dispatchNavigation({
        type: 'release',
        targetId: id,
        observedId: entryInReadingBand(elementsById.current) ?? (alignTarget ? id : null),
      })
    }

    const cancel = () => {
      if (done) return
      done = true
      cleanup()
    }

    function handleScroll() {
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => release(true), SCROLL_SETTLE_MS)
    }

    function handleUserInterrupt(event?: Event) {
      // Dragging the mobile map sheet is not the reader taking the page
      // scroll back, so it must not cancel a marker-driven scroll in flight.
      const target = event?.target
      if (target instanceof Element && target.closest('[data-listicle-map-sheet]')) {
        return
      }
      release(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (SCROLL_KEYS.has(event.key)) handleUserInterrupt()
    }

    navigationCleanup.current = cancel

    if (reduceMotion || alreadyAligned) {
      window.scrollTo({ top, behavior: 'auto' })
      window.requestAnimationFrame(() => release(true))
      return
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('wheel', handleUserInterrupt, { passive: true })
    window.addEventListener('touchstart', handleUserInterrupt, { passive: true })
    window.addEventListener('keydown', handleKeyDown)
    fallbackTimer = window.setTimeout(() => release(true), SCROLL_FALLBACK_MS)
    window.scrollTo({ top, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    navigationCleanup.current?.()
    navigationCleanup.current = null
    dispatchNavigation({ type: 'reset' })
  }, [points])

  useEffect(
    () => () => {
      navigationCleanup.current?.()
    },
    [],
  )

  const value = useMemo(
    () => ({ points, activeId, registerEntry, scrollToEntry }),
    [points, activeId, registerEntry, scrollToEntry],
  )

  return <MapSyncProvider value={value}>{children}</MapSyncProvider>
}
