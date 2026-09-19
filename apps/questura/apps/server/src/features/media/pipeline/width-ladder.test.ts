import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { generateVariantsFromSource } from './from-source'
import { VARIANT_SPECS } from './variant-specs'
import {
  SMALLEST_VARIANT_WIDTH,
  WIDTH_LADDER,
  isLadderFilename,
  ladderFilename,
} from './width-ladder'

const makeSource = async (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg()
    .toBuffer()

/** Real libvips work, same reason as from-source.test.ts. */
const IMAGE_WORK_TIMEOUT_MS = 30_000

describe('the ladder rule', () => {
  it('keeps every rung below the smallest variant', () => {
    // The client mirrors this ladder without being able to read this file, and
    // emits every rung for every variant. A rung at or above the smallest
    // variant would make that client ask for an upscale of a file — or, worse,
    // for a file the generator declined to produce.
    expect(SMALLEST_VARIANT_WIDTH).toBe(1080)
    for (const width of WIDTH_LADDER) {
      expect(width).toBeLessThan(SMALLEST_VARIANT_WIDTH)
    }
  })

  it('reaches small enough for a 40px thumbnail on a retina screen', () => {
    // The guides menu and related shelf draw 40x40 and used to pull 1920x1080.
    expect(Math.min(...WIDTH_LADDER)).toBeLessThanOrEqual(128)
  })

  it('names a rung beside its variant, keeping the extension last', () => {
    expect(ladderFilename('lima-bar-12_square.webp', 384)).toBe('lima-bar-12_square_w384.webp')
    expect(ladderFilename('no-extension', 128)).toBe('no-extension_w128')
    expect(ladderFilename('dotted.name.here_wide.webp', 960)).toBe(
      'dotted.name.here_wide_w960.webp',
    )
  })

  it('recognizes its own output, so a rung never grows a ladder', () => {
    expect(isLadderFilename('lima-bar-12_square_w384.webp')).toBe(true)
    expect(isLadderFilename('lima-bar-12_square.webp')).toBe(false)
    // A variant whose name merely ends in a digit must not be mistaken for one.
    expect(isLadderFilename('lima-bar-12_wide.webp')).toBe(false)
  })
})

describe('generated rungs', () => {
  it(
    'gives every variant the full ladder at the variant ratio',
    async () => {
      const source = await makeSource(3000, 2000)
      const variants = await generateVariantsFromSource({ sourceBuffer: source })

      expect(variants).toHaveLength(Object.keys(VARIANT_SPECS).length)

      for (const variant of variants) {
        const spec = VARIANT_SPECS[variant.variant]
        expect(variant.ladder.map((rung) => rung.width)).toEqual([...WIDTH_LADDER])

        for (const rung of variant.ladder) {
          const meta = await sharp(rung.buffer).metadata()
          expect(meta.format).toBe('webp')
          expect(meta.width).toBe(rung.width)
          expect(meta.height).toBe(rung.height)

          // Same picture, just smaller: a rung that drifted off the variant's
          // ratio would crop differently from the file it stands in for, so the
          // browser would swap the composition when it changed rung.
          expect(rung.width / rung.height).toBeCloseTo(spec.width / spec.height, 1)

          // The point of the exercise.
          expect(rung.buffer.length).toBeLessThan(variant.buffer.length)
        }
      }
    },
    IMAGE_WORK_TIMEOUT_MS,
  )

  it(
    'shrinks a 1080 square far enough to matter for a 40px thumbnail',
    async () => {
      const source = await makeSource(2000, 2000)
      const variants = await generateVariantsFromSource({ sourceBuffer: source })
      const square = variants.find((variant) => variant.variant === 'square')
      const smallest = square?.ladder[0]

      expect(smallest?.width).toBe(128)
      // A flat test image compresses unrealistically well, so this asserts the
      // direction and order of magnitude, not a byte count from the live CDN.
      expect(smallest!.buffer.length).toBeLessThan(square!.buffer.length / 2)
    },
    IMAGE_WORK_TIMEOUT_MS,
  )
})
