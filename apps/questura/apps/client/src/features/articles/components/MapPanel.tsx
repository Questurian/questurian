'use client'

import { useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import {
  useListicleMapSync,
  type ListicleMapPoint,
} from '@/features/articles/components/ListicleMapSync'

const LIMA_CENTER = { lat: -12.0464, lng: -77.0428 }
const DEFAULT_ZOOM = 13
const ACTIVE_ZOOM = 16
const FIT_PADDING = 56
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

  if (distance < 1) {
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

function fitToPoints(map: google.maps.Map, points: ListicleMapPoint[]) {
  if (points.length === 0) {
    map.setCenter(LIMA_CENTER)
    map.setZoom(DEFAULT_ZOOM)
    return
  }
  if (points.length === 1) {
    map.panTo({ lat: points[0].lat, lng: points[0].lng })
    map.setZoom(ACTIVE_ZOOM - 1)
    return
  }
  const bounds = new google.maps.LatLngBounds()
  for (const point of points) bounds.extend({ lat: point.lat, lng: point.lng })
  map.fitBounds(bounds, FIT_PADDING)
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
          mapId: 'questura-maps',
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
      const pin = new lib.PinElement({
        glyph: String(point.index + 1),
        glyphColor: '#ffffff',
        background: ACCENT,
        borderColor: ACCENT,
      })
      const marker = new lib.AdvancedMarkerElement({
        map,
        position: { lat: point.lat, lng: point.lng },
        title: point.title,
        content: pin.element,
      })
      markersById.current.set(point.id, marker)
    }

    fitToPoints(map, points)
  }, [ready, points])

  useEffect(() => {
    const map = mapInstance.current
    const lib = markerLib.current
    if (!ready || !map || !lib) return

    for (const point of points) {
      const marker = markersById.current.get(point.id)
      if (!marker) continue
      const isActive = point.id === activeId
      const pin = new lib.PinElement({
        glyph: String(point.index + 1),
        glyphColor: '#ffffff',
        background: isActive ? ACTIVE_PIN : ACCENT,
        borderColor: isActive ? ACTIVE_PIN : ACCENT,
        scale: isActive ? 1.45 : 1,
      })
      marker.content = pin.element
      marker.zIndex = isActive ? 1000 : 0
    }

    const active = points.find((point) => point.id === activeId)
    if (active) {
      flyTo(map, cameraAnimation.current, { lat: active.lat, lng: active.lng }, ACTIVE_ZOOM)
    } else {
      cancelAnimationFrame(cameraAnimation.current.frame)
      fitToPoints(map, points)
    }
  }, [ready, activeId, points])

  useEffect(() => {
    const animation = cameraAnimation.current
    return () => cancelAnimationFrame(animation.frame)
  }, [])

  return <div ref={mapRef} className="h-full w-full" />
}
