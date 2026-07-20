'use client'

import { useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import {
  useListicleMapSync,
  type ListicleMapPoint,
} from '@/features/articles/components/ListicleMapSync'

const LIMA_CENTER = { lat: -12.0464, lng: -77.0428 }
const DEFAULT_ZOOM = 13
// Street-level, close enough that the vector map extrudes buildings.
const ACTIVE_ZOOM = 18
const SINGLE_POINT_OVERVIEW_ZOOM = 15
const MAX_FIT_ZOOM = 17
// The overview should read as a neighborhood map with air around the pins,
// not a tight crop, so back off from the exact fit.
const OVERVIEW_ZOOM_OUT = 1.5
const FIT_PADDING = 56
const WORLD_TILE_PX = 256
const ACCENT = '#3B5BDB'
const ACTIVE_PIN = '#1a1a1a'

type CameraAnimation = { frame: number }

function haversineMeters(
  a: google.maps.LatLngLiteral,
  b: google.maps.LatLngLiteral,
): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/**
 * `map.panTo` only animates jumps smaller than roughly one viewport, so
 * moving between venues a few km apart at street zoom snap-fades instead of
 * panning. Drive the camera manually instead: slide the center (and zoom,
 * when it differs) across with easing, taking longer for longer hops.
 */
function flyTo(
  map: google.maps.Map,
  animation: CameraAnimation,
  target: google.maps.LatLngLiteral,
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

/** White house icon for 'stay' pins. */
function houseGlyph(): Element {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', '#ffffff')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const d of [
    'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
    'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  return svg
}

/** Small dot centered on the coordinate, for stops that aren't active. */
function dotElement(): HTMLElement {
  const dot = document.createElement('div')
  dot.style.width = '18px'
  dot.style.height = '18px'
  dot.style.borderRadius = '50%'
  dot.style.background = ACCENT
  dot.style.border = '2.5px solid #ffffff'
  dot.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.35)'
  // AdvancedMarkerElement anchors content bottom-center; shift so the dot
  // sits centered on the coordinate instead of floating above it.
  dot.style.transform = 'translateY(50%)'
  return dot
}

/**
 * Custom balloon pin with a blunt, rounded tip (Google's PinElement tapers
 * to a sharp point). The tip sits at bottom-center, matching the marker's
 * default anchor, so it points at the exact coordinate.
 */
function pinElement(background: string, scale: number, glyph: Element): HTMLElement {
  const width = 30 * scale
  const height = 38 * scale

  const wrap = document.createElement('div')
  wrap.style.position = 'relative'
  wrap.style.width = `${width}px`
  wrap.style.height = `${height}px`

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 30 38')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.style.display = 'block'
  svg.style.filter = 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35))'

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  // Round head that narrows into a short tail ending in a small arc,
  // so the bottom is a rounded nub rather than a sharp point.
  path.setAttribute(
    'd',
    'M15 1.5 C7.8 1.5 2 7.3 2 14.5 C2 21.5 9.6 30 13.2 35.2 A2.2 2.2 0 0 0 16.8 35.2 C20.4 30 28 21.5 28 14.5 C28 7.3 22.2 1.5 15 1.5 Z',
  )
  path.setAttribute('fill', background)
  path.setAttribute('stroke', '#ffffff')
  path.setAttribute('stroke-width', '2')
  svg.appendChild(path)
  wrap.appendChild(svg)

  const glyphBox = document.createElement('div')
  glyphBox.style.position = 'absolute'
  glyphBox.style.left = '50%'
  // Center of the pin head in the 30x38 viewBox is at y=14.5.
  glyphBox.style.top = `${(14.5 / 38) * 100}%`
  glyphBox.style.transform = 'translate(-50%, -50%)'
  glyphBox.style.display = 'flex'
  glyphBox.appendChild(glyph)
  wrap.appendChild(glyphBox)

  return wrap
}

/** Plain white dot glyph for the head of the active-stop pin. */
function innerDotGlyph(): Element {
  const dot = document.createElement('div')
  dot.style.width = '8px'
  dot.style.height = '8px'
  dot.style.borderRadius = '50%'
  dot.style.background = '#ffffff'
  return dot
}

/**
 * Stops render as dots until they're active, then swell into a soft-tipped
 * pin. 'stay' points always keep the house pin regardless of active state.
 */
function markerContent(point: ListicleMapPoint, isActive: boolean): HTMLElement {
  if (point.kind === 'stay') {
    return pinElement(isActive ? ACTIVE_PIN : ACCENT, isActive ? 1.3 : 1, houseGlyph())
  }

  return isActive ? pinElement(ACTIVE_PIN, 1.3, innerDotGlyph()) : dotElement()
}

function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180)
  return Math.log((1 + sin) / (1 - sin)) / 2
}

function latFromMercatorY(y: number): number {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI
}

/**
 * The center/zoom `fitBounds` would land on, computed up front so the move
 * can go through `flyTo` and animate — `fitBounds` itself snaps on jumps
 * larger than a viewport, which is what made day switches flash.
 */
function cameraForPoints(
  mapDiv: HTMLElement,
  points: ListicleMapPoint[],
): { center: google.maps.LatLngLiteral; zoom: number } {
  if (points.length === 0) return { center: LIMA_CENTER, zoom: DEFAULT_ZOOM }
  if (points.length === 1) {
    return {
      center: { lat: points[0].lat, lng: points[0].lng },
      zoom: SINGLE_POINT_OVERVIEW_ZOOM,
    }
  }

  const lats = points.map((point) => point.lat)
  const lngs = points.map((point) => point.lng)
  const north = Math.max(...lats)
  const south = Math.min(...lats)
  const east = Math.max(...lngs)
  const west = Math.min(...lngs)

  const latFraction = (mercatorY(north) - mercatorY(south)) / (2 * Math.PI)
  const lngFraction = (east - west) / 360

  const width = Math.max(mapDiv.clientWidth - FIT_PADDING * 2, 1)
  const height = Math.max(mapDiv.clientHeight - FIT_PADDING * 2, 1)
  const latZoom = Math.log2(height / WORLD_TILE_PX / Math.max(latFraction, 1e-9))
  const lngZoom = Math.log2(width / WORLD_TILE_PX / Math.max(lngFraction, 1e-9))

  return {
    center: {
      lat: latFromMercatorY((mercatorY(north) + mercatorY(south)) / 2),
      lng: (east + west) / 2,
    },
    zoom: Math.min(latZoom, lngZoom, MAX_FIT_ZOOM) - OVERVIEW_ZOOM_OUT,
  }
}

export function MapPanel() {
  const mapRef = useRef<HTMLDivElement>(null)
  const { points, activeId } = useListicleMapSync()

  const mapInstance = useRef<google.maps.Map | null>(null)
  const markerLib = useRef<google.maps.MarkerLibrary | null>(null)
  const markersById = useRef(
    new Map<string, google.maps.marker.AdvancedMarkerElement>(),
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

    for (const marker of markersById.current.values()) marker.map = null
    markersById.current.clear()

    for (const point of points) {
      const marker = new lib.AdvancedMarkerElement({
        map,
        position: { lat: point.lat, lng: point.lng },
        title: point.title,
        content: markerContent(point, false),
      })
      markersById.current.set(point.id, marker)
    }
  }, [ready, points])

  useEffect(() => {
    const map = mapInstance.current
    const lib = markerLib.current
    if (!ready || !map || !lib) return

    for (const point of points) {
      const marker = markersById.current.get(point.id)
      if (!marker) continue
      const isActive = point.id === activeId
      marker.content = markerContent(point, isActive)
      marker.zIndex = isActive ? 1000 : point.kind === 'stay' ? 500 : 0
    }

    const active = points.find((point) => point.id === activeId)
    if (active) {
      flyTo(map, cameraAnimation.current, { lat: active.lat, lng: active.lng }, ACTIVE_ZOOM)
    } else if (mapRef.current) {
      const camera = cameraForPoints(mapRef.current, points)
      if (hasFramedPoints.current) {
        flyTo(map, cameraAnimation.current, camera.center, camera.zoom)
      } else {
        cancelAnimationFrame(cameraAnimation.current.frame)
        map.moveCamera(camera)
      }
    }
    hasFramedPoints.current = true
  }, [ready, activeId, points])

  useEffect(() => {
    const animation = cameraAnimation.current
    return () => cancelAnimationFrame(animation.frame)
  }, [])

  return <div ref={mapRef} className="h-full w-full" />
}
