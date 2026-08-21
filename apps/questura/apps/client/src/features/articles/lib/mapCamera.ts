/**
 * Pure camera math for the listicle map. Lives outside MapPanel so the
 * framing rules can be tested without a Google Maps instance.
 */

export type LatLng = { lat: number; lng: number }

export type Camera = { center: LatLng; zoom: number }

export type CameraPoint = { lat: number; lng: number }

const WORLD_TILE_PX = 256
const TWO_PI = Math.PI * 2

export function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180)
  return Math.log((1 + sin) / (1 - sin)) / 2
}

export function latFromMercatorY(y: number): number {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/**
 * Shift a camera centre south by `pixels` at `zoom`, so a point that would
 * land on the map div's own centre instead lands higher up the div.
 *
 * The mobile sheet keeps a full-height map and slides it partly below the
 * fold, so the visible centre is above the div centre by half the hidden
 * height. Moving the camera south by that much puts the active stop back in
 * the middle of what the reader can actually see.
 */
export function shiftCenterSouthByPixels(
  center: LatLng,
  zoom: number,
  pixels: number,
): LatLng {
  if (pixels === 0) return center
  const worldPx = WORLD_TILE_PX * 2 ** zoom
  return {
    lat: latFromMercatorY(mercatorY(center.lat) - (pixels * TWO_PI) / worldPx),
    lng: center.lng,
  }
}

export type FitOptions = {
  /** Map div size in CSS pixels. */
  width: number
  height: number
  /** Map div pixels hidden below the fold (mobile sheet); 0 on desktop. */
  insetBottom?: number
  padding: number
  maxZoom: number
  /** Backs off from the exact fit so pins keep air around them. */
  zoomOut: number
  fallback: Camera
  singlePointZoom: number
}

/**
 * The centre/zoom `fitBounds` would land on, computed up front so the move
 * can go through the manual fly animation - `fitBounds` itself snaps on jumps
 * larger than a viewport, which is what made day switches flash.
 */
export function cameraForPoints(
  points: CameraPoint[],
  options: FitOptions,
): Camera {
  const inset = options.insetBottom ?? 0

  if (points.length === 0) return options.fallback
  if (points.length === 1) {
    return {
      center: shiftCenterSouthByPixels(
        { lat: points[0].lat, lng: points[0].lng },
        options.singlePointZoom,
        inset / 2,
      ),
      zoom: options.singlePointZoom,
    }
  }

  const lats = points.map((point) => point.lat)
  const lngs = points.map((point) => point.lng)
  const north = Math.max(...lats)
  const south = Math.min(...lats)
  const east = Math.max(...lngs)
  const west = Math.min(...lngs)

  const latFraction = (mercatorY(north) - mercatorY(south)) / TWO_PI
  const lngFraction = (east - west) / 360

  const usableWidth = Math.max(options.width - options.padding * 2, 1)
  const usableHeight = Math.max(options.height - inset - options.padding * 2, 1)
  const latZoom = Math.log2(
    usableHeight / WORLD_TILE_PX / Math.max(latFraction, 1e-9),
  )
  const lngZoom = Math.log2(
    usableWidth / WORLD_TILE_PX / Math.max(lngFraction, 1e-9),
  )

  const zoom = Math.min(latZoom, lngZoom, options.maxZoom) - options.zoomOut
  const center = {
    lat: latFromMercatorY((mercatorY(north) + mercatorY(south)) / 2),
    lng: (east + west) / 2,
  }

  return { center: shiftCenterSouthByPixels(center, zoom, inset / 2), zoom }
}
