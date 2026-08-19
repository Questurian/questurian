import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { computeFocalCrop, generateVariantsFromSource, normalizeFocalPoint } from './from-source'
import { VARIANT_SPECS } from './variant-specs'

const makeSource = async (width: number, height: number): Promise<Buffer> =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .jpeg()
    .toBuffer()

/**
 * These are the only tests in the whole server suite that do real libvips work,
 * and they are the slowest by a wide margin — ~1.4-2.2s for this file versus
 * ~450ms for the next slowest file in the suite. Everything else finishes in
 * milliseconds, so vitest's 5s default left them the least headroom of any test
 * while needing the most.
 *
 * The result was a flake that looked like a regression: on a loaded machine
 * (a parallel full-suite run, CI, a build in another terminal) these three
 * tests — and only these three — would intermittently fail with
 * `Test timed out`, on any branch including `main`.
 *
 * Confirmed by forcing `--testTimeout=400`, which reproduces exactly the same
 * three test names. The failure is always the clock, never a wrong image: no
 * assertion on width, height or format has ever been the thing that failed.
 *
 * So the timeout is raised here, per test, rather than globally — a hang in any
 * other test should still trip the 5s default rather than sit for half a minute.
 */
const IMAGE_WORK_TIMEOUT_MS = 30_000

describe('normalizeFocalPoint', () => {
  it('clamps out-of-range values', () => {
    expect(normalizeFocalPoint({ x: -1, y: 2 })).toEqual({ x: 0, y: 1 })
  })

  it('falls back to center when nullish', () => {
    expect(normalizeFocalPoint(null)).toEqual({ x: 0.5, y: 0.5 })
    expect(normalizeFocalPoint(undefined)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('replaces NaN coords with center', () => {
    expect(normalizeFocalPoint({ x: NaN, y: 0.3 })).toEqual({ x: 0.5, y: 0.3 })
  })
})

describe('computeFocalCrop', () => {
  it('matches the variant aspect ratio', () => {
    const crop = computeFocalCrop(3000, 2000, VARIANT_SPECS.square, { x: 0.5, y: 0.5 })
    expect(crop.width).toBe(crop.height)
  })

  it('biases the crop window toward the focal point', () => {
    const left = computeFocalCrop(3000, 2000, VARIANT_SPECS.square, { x: 0.1, y: 0.5 })
    const center = computeFocalCrop(3000, 2000, VARIANT_SPECS.square, { x: 0.5, y: 0.5 })
    expect(left.left).toBeLessThan(center.left)
  })

  it('clamps the crop window to image bounds', () => {
    const crop = computeFocalCrop(3000, 2000, VARIANT_SPECS.square, { x: 0, y: 0 })
    expect(crop.left).toBe(0)
    expect(crop.top).toBe(0)

    const farCrop = computeFocalCrop(3000, 2000, VARIANT_SPECS.square, { x: 1, y: 1 })
    expect(farCrop.left + farCrop.width).toBe(3000)
    expect(farCrop.top + farCrop.height).toBe(2000)
  })

  it('uses the full smaller dimension when source is wider than target', () => {
    const crop = computeFocalCrop(3000, 1000, VARIANT_SPECS.square, { x: 0.5, y: 0.5 })
    expect(crop.height).toBe(1000)
    expect(crop.width).toBe(1000)
  })

  it('uses the full smaller dimension when source is taller than target', () => {
    const crop = computeFocalCrop(800, 2000, VARIANT_SPECS.square, { x: 0.5, y: 0.5 })
    expect(crop.width).toBe(800)
    expect(crop.height).toBe(800)
  })
})

describe('generateVariantsFromSource', () => {
  it('produces all 7 variants at their target dimensions', async () => {
    const source = await makeSource(3000, 2000)
    const variants = await generateVariantsFromSource({ sourceBuffer: source })

    expect(variants).toHaveLength(7)

    for (const generated of variants) {
      const meta = await sharp(generated.buffer).metadata()
      const spec = VARIANT_SPECS[generated.variant]
      expect(meta.width).toBe(spec.width)
      expect(meta.height).toBe(spec.height)
      expect(meta.format).toBe('webp')
    }
  }, IMAGE_WORK_TIMEOUT_MS)

  it('rejects when the source buffer cannot be parsed as an image', async () => {
    await expect(
      generateVariantsFromSource({ sourceBuffer: Buffer.from('not an image') }),
    ).rejects.toThrow()
  })

  it('honors per-variant overrides over the focal point', async () => {
    const source = await makeSource(2000, 2000)
    const variants = await generateVariantsFromSource({
      sourceBuffer: source,
      focalPoint: { x: 0.1, y: 0.1 },
      overrides: {
        square: { left: 500, top: 500, width: 1000, height: 1000 },
      },
    })

    const square = variants.find((v) => v.variant === 'square')
    expect(square).toBeDefined()
    const meta = await sharp(square!.buffer).metadata()
    expect(meta.width).toBe(VARIANT_SPECS.square.width)
    expect(meta.height).toBe(VARIANT_SPECS.square.height)
  }, IMAGE_WORK_TIMEOUT_MS)
})
