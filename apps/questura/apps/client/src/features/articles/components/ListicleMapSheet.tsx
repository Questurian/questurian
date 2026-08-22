'use client'

import { useCallback, useEffect, useState, type JSX } from 'react'
import { CornerUpLeft, List, Map as MapIcon, MapPin, Rows2 } from 'lucide-react'
import type { ListicleMapGuides } from '@/features/articles/components/ListicleMapGuidesMenu'
import { MapPanel } from '@/features/articles/components/MapPanel'
import { ListicleMapVenueCard } from '@/features/articles/components/ListicleMapVenueCard'
import { useListicleMapSync } from '@/features/articles/components/ListicleMapSync'
import {
  hiddenBelowFold,
  sheetHeightPx,
  translateForVisibleHeight,
  visibleHeightForMode,
  LISTICLE_MAP_MODES,
  LISTICLE_MAP_MODE_LABELS,
  type ListicleMapMode,
} from '@/features/articles/components/ListicleMapModes'

/**
 * Space the article leaves under its last entry so the floating switch never
 * covers copy. Also the starting guess for how much of the map the floating
 * stack hides, before it has been measured.
 */
export const LISTICLE_MAP_PILL_CLEARANCE = 72
/**
 * How close the camera sits on the active stop, per mode.
 *
 * Below the desktop's 17: a phone at street zoom shows one block and one
 * dot, which makes the map look empty and tells the reader nothing about what
 * else is nearby. Close enough, though, that the streets around the stop are
 * legible - a stop framed at neighbourhood scale is not worth centring on.
 * The takeover pulls back slightly because it has the most screen to fill.
 *
 * `list` is never actually used - the camera is paused in that mode - but it
 * is declared so the map is fully described by its mode.
 */
const MODE_ACTIVE_ZOOM: Record<ListicleMapMode, number> = {
  list: 15.5,
  split: 15.5,
  map: 15.25,
}
const MOBILE_FIT_PADDING = 28

const MODE_ICONS: Record<ListicleMapMode, typeof List> = {
  list: List,
  split: Rows2,
  map: MapIcon,
}

/**
 * The phone counterpart to the desktop map column: a full-viewport sheet that
 * slides up behind a floating three-way switch.
 *
 * `list` parks the sheet off screen, `split` shows the map under the copy the
 * reader is scrolling, and `map` is a takeover that covers everything but the
 * navbar.
 * The switch stays put in all three, so there is always one visible control
 * saying where you are and how to get back. The takeover also floats a card
 * for the active stop, because it is the one mode where the reading column
 * cannot say what a pin is.
 *
 * The switch is the only way to change mode. A drag handle used to sit on the
 * sheet's top edge, which in the takeover is the top of the screen - exactly
 * where a downward drag opens the phone's notification shade instead.
 *
 * The sheet is always the full viewport tall and only its transform changes,
 * so the map never resizes. What that costs is framing: in `split` the map's
 * own centre sits below the fold, so MapPanel is told how much of itself is
 * hidden and aims at the visible slice instead. Live drag offsets move the
 * sheet but deliberately do not reach MapPanel - the camera settles once per
 * mode, not once per frame.
 */
export function ListicleMapSheet({
  guides,
}: {
  guides?: ListicleMapGuides
}): JSX.Element | null {
  const { points, activeId, scrollToEntry } = useListicleMapSync()
  const [mode, setMode] = useState<ListicleMapMode>('list')
  // The map is mounted the first time the reader asks for it and then kept,
  // so going back and forth never pays for a second billed map load.
  const [hasOpened, setHasOpened] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(0)
  // The takeover stops under the navbar, so its height is part of the sheet's
  // geometry. Read from the variable the navbar keeps in sync rather than
  // hard-coding it.
  const [navbarHeight, setNavbarHeight] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  // The card and switch cover the bottom of the map, and the card's height
  // depends on whether the stop has a photo and a blurb - so it is measured
  // rather than assumed, and fed back into the camera as hidden space.
  const [overlayHeight, setOverlayHeight] = useState(LISTICLE_MAP_PILL_CLEARANCE)

  useEffect(() => {
    const sync = () => {
      setViewportHeight(window.innerHeight)
      const declared = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--navbar-height'),
      )
      setNavbarHeight(Number.isFinite(declared) ? declared : 0)
    }
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduceMotion(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (mode !== 'list') setHasOpened(true)
  }, [mode])

  /**
   * Split parks an opaque sheet over the bottom of the viewport, and the page
   * cannot scroll out from under it: at maximum scroll the end of the article
   * is still behind the map.
   *
   * The fix is exactly one sheet-height of extra scroll, and it has to come
   * after everything in the document. Inside the article column it only opens
   * a gap of empty background above the footer - the reader scrolls past the
   * end into nothing, which is worse than the bug. Padding the body puts that
   * height below the footer, where the sheet covers it at maximum scroll, so
   * the page stops with its last line resting on the sheet's top edge.
   */
  useEffect(() => {
    if (mode !== 'split' || viewportHeight === 0) return

    const body = document.body
    const previous = body.style.paddingBottom
    body.style.paddingBottom = `${visibleHeightForMode('split', viewportHeight)}px`
    return () => {
      body.style.paddingBottom = previous
    }
  }, [mode, viewportHeight])

  const overlayRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    setOverlayHeight(node.offsetHeight)
    const observer = new ResizeObserver(() => setOverlayHeight(node.offsetHeight))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const handleReturnToEntry = useCallback(() => {
    if (activeId) scrollToEntry(activeId)
    setMode('list')
  }, [activeId, scrollToEntry])

  if (points.length === 0 || viewportHeight === 0) return null

  const height = sheetHeightPx(viewportHeight)
  const visibleHeight = visibleHeightForMode(mode, viewportHeight, navbarHeight)
  const translateY = translateForVisibleHeight(visibleHeight, viewportHeight)
  const mapInset = hiddenBelowFold(visibleHeight, viewportHeight) + overlayHeight

  const activeIndex = points.findIndex((point) => point.id === activeId)
  const activePoint = activeIndex >= 0 ? points[activeIndex] : null
  const showMap = mode !== 'list'
  const transition = reduceMotion
    ? 'none'
    : 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)'

  return (
    <>
      <div
        data-listicle-map-sheet=""
        id="listicle-map-sheet-panel"
        className={`fixed inset-x-0 bottom-0 z-50 flex flex-col bg-background 1024:hidden ${
          mode === 'split' ? 'border-t-[3px] border-double border-foreground/55' : ''
        }`}
        style={{ height, transform: `translateY(${translateY}px)`, transition }}
        inert={!showMap}
      >
        <div className="min-h-0 flex-1">
          {hasOpened ? (
            <MapPanel
              viewportInsetBottomPx={mapInset}
              paused={mode === 'list'}
              activeZoom={MODE_ACTIVE_ZOOM[mode]}
              fitPadding={MOBILE_FIT_PADDING}
              guides={guides}
              // Split keeps the article on screen with its day tabs and its
              // scroll, so the map only adds what the phone cannot otherwise
              // reach: the related guides.
              showArticleControls={mode === 'map'}
            />
          ) : null}
        </div>
      </div>

      <div
        ref={overlayRef}
        data-listicle-map-sheet=""
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2.5 px-3 1024:hidden"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {mode === 'map' && activePoint ? (
          <ListicleMapVenueCard
            point={activePoint}
            position={activeIndex + 1}
            total={points.length}
            onOpen={handleReturnToEntry}
          />
        ) : null}

        {mode === 'split' && activePoint ? (
          <button
            type="button"
            onClick={handleReturnToEntry}
            className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-foreground/15 bg-paper px-3.5 py-2 shadow-[0_6px_20px_rgba(26,26,26,0.18)]"
          >
            <MapPin className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 truncate text-[13px] font-semibold leading-none text-foreground">
              {activePoint.title}
            </span>
            <span className="shrink-0 text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-foreground/45">
              {activeIndex + 1}/{points.length}
            </span>
            <CornerUpLeft
              className="size-3.5 shrink-0 text-foreground/45"
              aria-hidden="true"
            />
          </button>
        ) : null}

        <div
          role="group"
          aria-label="Article view"
          className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-foreground/15 bg-paper p-1 shadow-[0_6px_20px_rgba(26,26,26,0.18)]"
        >
          {LISTICLE_MAP_MODES.map((option) => {
            const isCurrent = option === mode
            const Icon = MODE_ICONS[option]
            return (
              <button
                key={option}
                type="button"
                aria-pressed={isCurrent}
                aria-controls="listicle-map-sheet-panel"
                onClick={() => setMode(option)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold uppercase leading-none tracking-[0.12em] transition-colors 380:px-4 ${
                  isCurrent
                    ? 'bg-accent text-white'
                    : 'text-foreground/60 hover:text-foreground'
                }`}
              >
                <Icon className="size-[15px] shrink-0" aria-hidden="true" />
                {LISTICLE_MAP_MODE_LABELS[option]}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
