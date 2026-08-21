'use client'

import { useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import {
  useListicleMapSync,
  type ListicleMapPoint,
} from '@/features/articles/components/ListicleMapSync'
import {
  cameraForPoints,
  haversineMeters,
  shiftCenterSouthByPixels,
  type LatLng,
} from '@/features/articles/lib/mapCamera'

const LIMA_CENTER = { lat: -12.0464, lng: -77.0428 }
const DEFAULT_ZOOM = 13
// Keep enough neighborhood context visible while focusing the active stop.
const ACTIVE_ZOOM = 17
const SINGLE_POINT_OVERVIEW_ZOOM = 15
const MAX_FIT_ZOOM = 17
// The overview should read as a neighborhood map with air around the pins,
// not a tight crop, so back off from the exact fit.
const OVERVIEW_ZOOM_OUT = 1.5
const FIT_PADDING = 56
const ACCENT = '#3B5BDB'
const ACTIVE_PIN = '#1a1a1a'

type CameraAnimation = { frame: number }

/**
 * `map.panTo` only animates jumps smaller than roughly one viewport, so
 * moving between venues a few km apart at street zoom snap-fades instead of
 * panning. Drive the camera manually instead: slide the center (and zoom,
 * when it differs) across with easing, taking longer for longer hops.
 */
function flyTo(
  map: google.maps.Map,
  animation: CameraAnimation,
  target: LatLng,
  targetZoom: number,
) {
  cancelAnimationFrame(animation.frame)

  const startCenter = map.getCenter()
  const startZoom = map.getZoom()
  if (!startCenter || startZoom === undefined) {
    map.moveCamera({ center: target, zoom: targetZoom })
    return
  }

  const from = { lat: startCenter.lat(), lng: startCenter.lng() }
  const distance = haversineMeters(from, target)

  if (distance < 1 && Math.abs(targetZoom - startZoom) < 0.01) {
    map.moveCamera({ center: target, zoom: targetZoom })
    return
  }

  const duration = Math.min(800 + distance / 4, 2200)
  const startTime = performance.now()
  const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

  const step = (now: number) => {
    const t = Math.min((now - startTime) / duration, 1)
    const eased = easeInOut(t)

    map.moveCamera({
      center: {
        lat: from.lat + (target.lat - from.lat) * eased,
        lng: from.lng + (target.lng - from.lng) * eased,
      },
      zoom: startZoom + (targetZoom - startZoom) * eased,
    })

    if (t < 1) animation.frame = requestAnimationFrame(step)
  }

  animation.frame = requestAnimationFrame(step)
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const PIN_WIDTH = 26
const PIN_HEIGHT = 37
const DOT_SIZE = 14
/**
 * Teardrop whose tail edges are tangent to the head circle (centre 12,12,
 * r 9), so head and tail meet without a crease and the tip lands exactly on
 * the coordinate at the marker's bottom-centre anchor.
 */
const PIN_PATH = 'M3.96 16.05A9 9 0 1 1 20.04 16.05L12 32Z'
const PIN_SHADOW =
  'drop-shadow(0 1px 1px rgba(23, 20, 15, 0.22)) drop-shadow(0 4px 7px rgba(23, 20, 15, 0.18))'
const DOT_SHADOW = 'drop-shadow(0 1px 1.5px rgba(23, 20, 15, 0.3))'
const SWELL = 'transform 200ms cubic-bezier(0.2, 0.8, 0.25, 1), opacity 150ms ease'

function svgRoot(viewBox: string, width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  // Vector edges stay clean at the half-pixel offsets map panning produces.
  svg.setAttribute('shape-rendering', 'geometricPrecision')
  svg.style.display = 'block'
  svg.style.overflow = 'visible'
  return svg
}

/** White house outline for 'stay' pins, scaled into the pin head. */
function houseGlyph(): SVGElement {
  const group = document.createElementNS(SVG_NS, 'g')
  // Lucide's house sits in a 24-box; shrink it and re-centre on the head.
  group.setAttribute('transform', 'translate(12 12) scale(0.46) translate(-12 -12)')
  group.setAttribute('fill', 'none')
  group.setAttribute('stroke', '#ffffff')
  group.setAttribute('stroke-width', '2.4')
  group.setAttribute('stroke-linecap', 'round')
  group.setAttribute('stroke-linejoin', 'round')
  for (const d of [
    'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
    'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ]) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    group.appendChild(path)
  }
  return group
}

/** White bullseye for the head of a 'stop' pin. */
function bullseyeGlyph(): SVGElement {
  const circle = document.createElementNS(SVG_NS, 'circle')
  circle.setAttribute('cx', '12')
  circle.setAttribute('cy', '12')
  circle.setAttribute('r', '3.1')
  circle.setAttribute('fill', '#ffffff')
  return circle
}

function pinSvg(kind: ListicleMapPoint['kind']): SVGSVGElement {
  const svg = svgRoot('0 0 24 34', PIN_WIDTH, PIN_HEIGHT)
  svg.style.filter = PIN_SHADOW

  const body = document.createElementNS(SVG_NS, 'path')
  body.setAttribute('d', PIN_PATH)
  body.setAttribute('fill', ACCENT)
  body.setAttribute('stroke', '#ffffff')
  body.setAttribute('stroke-width', '1.75')
  body.setAttribute('stroke-linejoin', 'round')
  body.dataset.pinBody = ''
  svg.appendChild(body)
  svg.appendChild(kind === 'stay' ? houseGlyph() : bullseyeGlyph())

  return svg
}

/** Small ringed dot centred on the coordinate, for stops that aren't active. */
function dotSvg(): SVGSVGElement {
  const svg = svgRoot('0 0 14 14', DOT_SIZE, DOT_SIZE)
  svg.style.filter = DOT_SHADOW

  const circle = document.createElementNS(SVG_NS, 'circle')
  circle.setAttribute('cx', '7')
  circle.setAttribute('cy', '7')
  circle.setAttribute('r', '5.1')
  circle.setAttribute('fill', ACCENT)
  circle.setAttribute('stroke', '#ffffff')
  circle.setAttribute('stroke-width', '1.8')
  svg.appendChild(circle)

  return svg
}

type MarkerContent = {
  element: HTMLElement
  setActive: (isActive: boolean) => void
}

/**
 * Stops render as a dot until they're active, then the dot shrinks away as a
 * pin grows out of the same coordinate. Both layers live in one element so the
 * swap is a CSS transition rather than a content rebuild, which popped.
 * 'stay' points always show the house pin and only swell when active.
 */
function createMarkerContent(point: ListicleMapPoint): MarkerContent {
  const isStay = point.kind === 'stay'

  // AdvancedMarkerElement anchors content bottom-centre: the pin's tip and the
  // dot's middle both sit on that point.
  const wrap = document.createElement('div')
  wrap.style.position = 'relative'
  wrap.style.width = `${PIN_WIDTH}px`
  wrap.style.height = `${PIN_HEIGHT}px`

  const pin = pinSvg(point.kind)
  pin.style.position = 'absolute'
  pin.style.left = '50%'
  pin.style.bottom = '0'
  pin.style.transformOrigin = 'bottom center'
  pin.style.transition = SWELL

  const dot = dotSvg()
  dot.style.position = 'absolute'
  dot.style.left = '50%'
  dot.style.bottom = '0'
  dot.style.transformOrigin = 'center'
  dot.style.transition = SWELL
  if (isStay) dot.style.display = 'none'

  wrap.appendChild(dot)
  wrap.appendChild(pin)

  const body = pin.querySelector<SVGPathElement>('[data-pin-body]')

  const setActive = (isActive: boolean) => {
    body?.setAttribute('fill', isActive ? ACTIVE_PIN : ACCENT)

    const pinShown = isStay || isActive
    const pinScale = isActive ? (isStay ? 1.15 : 1) : isStay ? 1 : 0.55
    pin.style.transform = `translateX(-50%) scale(${pinScale})`
    pin.style.opacity = pinShown ? '1' : '0'

    dot.style.transform = `translate(-50%, 50%) scale(${isActive ? 0.4 : 1})`
    dot.style.opacity = isActive ? '0' : '1'
  }

  setActive(false)
  return { element: wrap, setActive }
}

export type MapPanelProps = {
  /**
   * Map div pixels sitting below the fold. The mobile sheet keeps the map at
   * a fixed height and slides it, so framing has to aim at the visible slice
   * rather than the div's own center. Desktop leaves this at 0.
   */
  viewportInsetBottomPx?: number
  /** Hold the camera still while the map is out of sight (sheet collapsed). */
  paused?: boolean
  /** Small viewports need a wider view to keep a stop in context. */
  activeZoom?: number
  fitPadding?: number
}

export function MapPanel({
  viewportInsetBottomPx = 0,
  paused = false,
  activeZoom = ACTIVE_ZOOM,
  fitPadding = FIT_PADDING,
}: MapPanelProps = {}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const { points, activeId, scrollToEntry } = useListicleMapSync()

  const mapInstance = useRef<google.maps.Map | null>(null)
  const markerLib = useRef<google.maps.MarkerLibrary | null>(null)
  const markersById = useRef(
    new Map<
      string,
      { marker: google.maps.marker.AdvancedMarkerElement; content: MarkerContent }
    >(),
  )
  const cameraAnimation = useRef<CameraAnimation>({ frame: 0 })
  // First framing happens while the map is still hidden behind tile loading,
  // so it jumps straight there; every later re-frame (day switch, scroll out
  // of the active band) animates.
  const hasFramedPoints = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setOptions({
      key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      v: 'weekly',
    })

    let cancelled = false
    Promise.all([importLibrary('maps'), importLibrary('marker')]).then(
      ([{ Map }, marker]) => {
        if (cancelled || !mapRef.current) return
        mapInstance.current = new Map(mapRef.current, {
          center: LIMA_CENTER,
          zoom: DEFAULT_ZOOM,
          // Cloud-styled map ("Questura Itinerary Map" in Map Management):
          // minimal grayscale, POIs/transit hidden, parks kept as soft shapes.
          mapId: 'b1fa459be393f82b57d646a2',
          disableDefaultUI: true,
          clickableIcons: false,
        })
        markerLib.current = marker
        setReady(true)
      },
    )

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    const lib = markerLib.current
    if (!ready || !map || !lib) return

    for (const entry of markersById.current.values()) entry.marker.map = null
    markersById.current.clear()

    for (const point of points) {
      const content = createMarkerContent(point)
      const marker = new lib.AdvancedMarkerElement({
        map,
        position: { lat: point.lat, lng: point.lng },
        title: point.title,
        content: content.element,
        gmpClickable: true,
      })
      marker.addEventListener('gmp-click', () => scrollToEntry(point.id))
      markersById.current.set(point.id, { marker, content })
    }
  }, [ready, points, scrollToEntry])

  useEffect(() => {
    const map = mapInstance.current
    const lib = markerLib.current
    if (!ready || !map || !lib) return

    for (const point of points) {
      const entry = markersById.current.get(point.id)
      if (!entry) continue
      const isActive = point.id === activeId
      entry.content.setActive(isActive)
      entry.marker.zIndex = isActive ? 1000 : point.kind === 'stay' ? 500 : 0
    }
  }, [ready, activeId, points])

  useEffect(() => {
    const map = mapInstance.current
    if (!ready || !map || paused || !mapRef.current) return

    const active = points.find((point) => point.id === activeId)
    const camera = active
      ? {
          center: shiftCenterSouthByPixels(
            { lat: active.lat, lng: active.lng },
            activeZoom,
            viewportInsetBottomPx / 2,
          ),
          zoom: activeZoom,
        }
      : cameraForPoints(points, {
          width: mapRef.current.clientWidth,
          height: mapRef.current.clientHeight,
          insetBottom: viewportInsetBottomPx,
          padding: fitPadding,
          maxZoom: MAX_FIT_ZOOM,
          zoomOut: OVERVIEW_ZOOM_OUT,
          singlePointZoom: SINGLE_POINT_OVERVIEW_ZOOM,
          fallback: { center: LIMA_CENTER, zoom: DEFAULT_ZOOM },
        })

    if (hasFramedPoints.current) {
      flyTo(map, cameraAnimation.current, camera.center, camera.zoom)
    } else {
      cancelAnimationFrame(cameraAnimation.current.frame)
      map.moveCamera(camera)
    }
    hasFramedPoints.current = true
  }, [ready, activeId, points, paused, viewportInsetBottomPx, activeZoom, fitPadding])

  useEffect(() => {
    const animation = cameraAnimation.current
    return () => cancelAnimationFrame(animation.frame)
  }, [])

  return <div ref={mapRef} className="h-full w-full" />
}
