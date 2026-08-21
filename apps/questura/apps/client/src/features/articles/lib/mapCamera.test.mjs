import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cameraForPoints,
  haversineMeters,
  latFromMercatorY,
  mercatorY,
  shiftCenterSouthByPixels,
} from './mapCamera.ts'

const FIT = {
  width: 600,
  height: 800,
  padding: 56,
  maxZoom: 17,
  zoomOut: 1.5,
  singlePointZoom: 15,
  fallback: { center: { lat: -12.0464, lng: -77.0428 }, zoom: 13 },
}

const LIMA = { lat: -12.0464, lng: -77.0428 }

test('mercator round-trips', () => {
  for (const lat of [-60, -12.0464, 0, 33.7, 71.2]) {
    assert.ok(Math.abs(latFromMercatorY(mercatorY(lat)) - lat) < 1e-9)
  }
})

test('haversine matches a known short distance', () => {
  const meters = haversineMeters(LIMA, { lat: -12.0464, lng: -77.0328 })
  assert.ok(meters > 1000 && meters < 1150, `got ${meters}`)
})

test('a zero inset leaves the centre alone', () => {
  assert.deepEqual(shiftCenterSouthByPixels(LIMA, 16, 0), LIMA)
})

test('shifting south lowers the latitude and keeps longitude', () => {
  const shifted = shiftCenterSouthByPixels(LIMA, 16, 200)
  assert.ok(shifted.lat < LIMA.lat)
  assert.equal(shifted.lng, LIMA.lng)
})

test('the same pixel shift covers less ground as zoom increases', () => {
  const near = LIMA.lat - shiftCenterSouthByPixels(LIMA, 18, 200).lat
  const far = LIMA.lat - shiftCenterSouthByPixels(LIMA, 14, 200).lat
  assert.ok(far > near)
})

test('no points falls back to the city overview', () => {
  assert.deepEqual(cameraForPoints([], FIT), FIT.fallback)
})

test('a single point uses the overview zoom and centres on it', () => {
  const camera = cameraForPoints([LIMA], FIT)
  assert.equal(camera.zoom, FIT.singlePointZoom)
  assert.deepEqual(camera.center, LIMA)
})

test('a single point is pushed south when the sheet hides the lower half', () => {
  const camera = cameraForPoints([LIMA], { ...FIT, insetBottom: 400 })
  assert.ok(camera.center.lat < LIMA.lat)
})

test('many points fit inside the max zoom, backed off by the zoom-out', () => {
  const camera = cameraForPoints(
    [LIMA, { lat: -12.1, lng: -77.03 }, { lat: -12.09, lng: -77.06 }],
    FIT,
  )
  assert.ok(camera.zoom <= FIT.maxZoom - FIT.zoomOut)
  assert.ok(camera.center.lat < LIMA.lat && camera.center.lat > -12.1)
})

test('hiding part of the map zooms further out to keep every pin visible', () => {
  const open = cameraForPoints([LIMA, { lat: -12.1, lng: -77.03 }], FIT)
  const half = cameraForPoints([LIMA, { lat: -12.1, lng: -77.03 }], {
    ...FIT,
    insetBottom: 400,
  })
  assert.ok(half.zoom < open.zoom)
})
