import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

import {
  backfillAssetLadder,
  backfillWidthLadder,
  ladderFromVariantFile,
  type LadderIo,
} from './backfill-width-ladder'
import { VARIANT_SPECS } from './variant-specs'
import { WIDTH_LADDER, ladderFilename } from './width-ladder'

const IMAGE_WORK_TIMEOUT_MS = 30_000

const makeVariantFile = async (variant: keyof typeof VARIANT_SPECS): Promise<Buffer> => {
  const spec = VARIANT_SPECS[variant]
  return sharp({
    create: { width: spec.width, height: spec.height, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .webp()
    .toBuffer()
}

/** An in-memory stand-in for the Bunny storage zone. */
const makeIo = (files: Record<string, Buffer>) => {
  const written: Record<string, Buffer> = {}
  const io: LadderIo = {
    exists: async (filename) => filename in files || filename in written,
    read: async (filename) => {
      const file = files[filename] ?? written[filename]
      if (!file) throw new Error(`missing ${filename}`)
      return file
    },
    write: async (filename, buffer) => {
      written[filename] = buffer
    },
  }
  return { io, written }
}

describe('ladderFromVariantFile', () => {
  it(
    'resizes the published variant rather than re-cropping the original',
    async () => {
      // A rung must be the same picture as the file it stands in for. Re-running
      // the focal-point crop could compose it differently, and the browser would
      // visibly change the photo when it changed rung.
      const file = await makeVariantFile('wide')
      const rungs = await ladderFromVariantFile(file, 'wide')

      expect(rungs.map((rung) => rung.width)).toEqual([...WIDTH_LADDER])

      for (const rung of rungs) {
        const meta = await sharp(rung.buffer).metadata()
        expect(meta.width).toBe(rung.width)
        expect(rung.width / rung.height).toBeCloseTo(1920 / 1080, 1)
      }
    },
    IMAGE_WORK_TIMEOUT_MS,
  )
})

describe('backfillAssetLadder', () => {
  it(
    'writes every missing rung beside the variant it came from',
    async () => {
      const filename = 'lima-bar-12_square.webp'
      const { io, written } = makeIo({ [filename]: await makeVariantFile('square') })

      const result = await backfillAssetLadder({ id: 7, filename, variant: 'square' }, io)

      expect(result.written).toEqual([...WIDTH_LADDER])
      expect(result.failed).toEqual([])
      expect(Object.keys(written).sort()).toEqual(
        WIDTH_LADDER.map((width) => ladderFilename(filename, width)).sort(),
      )
    },
    IMAGE_WORK_TIMEOUT_MS,
  )

  it(
    'never rewrites the variant file it read',
    async () => {
      // The add-only property, asserted rather than trusted: this is the whole
      // reason the job is safe to run over published media.
      const filename = 'lima-bar-12_square.webp'
      const { io, written } = makeIo({ [filename]: await makeVariantFile('square') })

      await backfillAssetLadder({ id: 7, filename, variant: 'square' }, io)

      expect(Object.keys(written)).not.toContain(filename)
    },
    IMAGE_WORK_TIMEOUT_MS,
  )

  it('costs HEADs only when every rung is already present', async () => {
    const filename = 'lima-bar-12_square.webp'
    const present = Object.fromEntries(
      WIDTH_LADDER.map((width) => [ladderFilename(filename, width), Buffer.from('x')]),
    )
    const { io } = makeIo(present)
    const read = vi.spyOn(io, 'read')

    const result = await backfillAssetLadder({ id: 7, filename, variant: 'square' }, io)

    // A re-run over thousands of photos must not decode a single image.
    expect(read).not.toHaveBeenCalled()
    expect(result.alreadyPresent).toEqual([...WIDTH_LADDER])
    expect(result.written).toEqual([])
  })

  it(
    'writes only the rungs that are missing',
    async () => {
      const filename = 'lima-bar-12_square.webp'
      const { io, written } = makeIo({
        [filename]: await makeVariantFile('square'),
        [ladderFilename(filename, 128)]: Buffer.from('x'),
        [ladderFilename(filename, 256)]: Buffer.from('x'),
      })

      const result = await backfillAssetLadder({ id: 7, filename, variant: 'square' }, io)

      expect(result.alreadyPresent).toEqual([128, 256])
      expect(result.written).toEqual([384, 640, 960])
      expect(Object.keys(written)).toHaveLength(3)
    },
    IMAGE_WORK_TIMEOUT_MS,
  )

  it(
    'reports a failed rung instead of abandoning the rest',
    async () => {
      const filename = 'lima-bar-12_square.webp'
      const { io } = makeIo({ [filename]: await makeVariantFile('square') })
      const realWrite = io.write
      io.write = async (name, buffer) => {
        if (name.endsWith('_w384.webp')) throw new Error('Bunny said 503')
        return realWrite(name, buffer)
      }

      const result = await backfillAssetLadder({ id: 7, filename, variant: 'square' }, io)

      expect(result.failed).toEqual([{ width: 384, reason: 'Bunny said 503' }])
      expect(result.written).toEqual([128, 256, 640, 960])
    },
    IMAGE_WORK_TIMEOUT_MS,
  )
})

describe('backfillWidthLadder', () => {
  const makePayload = (docs: unknown[]) => ({
    find: vi.fn().mockResolvedValue({ docs, hasNextPage: false }),
  })

  it(
    'skips rows with no usable variant rather than guessing a shape',
    async () => {
      const { io, written } = makeIo({ 'lima_square.webp': await makeVariantFile('square') })
      const payload = makePayload([
        { id: 1, filename: 'lima_square.webp', variant: 'square' },
        { id: 2, filename: 'source-upload.webp', variant: null },
        { id: 3, filename: null, variant: 'wide' },
        { id: 4, filename: 'legacy.webp', variant: 'banner' },
      ])

      const summary = await backfillWidthLadder({ payload: payload as never, io })

      expect(summary.assetsVisited).toBe(1)
      expect(summary.assetsSkipped).toBe(3)
      expect(Object.keys(written)).toHaveLength(WIDTH_LADDER.length)
    },
    IMAGE_WORK_TIMEOUT_MS,
  )

  it(
    'writes nothing on a dry run but still reports what it would write',
    async () => {
      const { io, written } = makeIo({ 'lima_square.webp': await makeVariantFile('square') })
      const payload = makePayload([{ id: 1, filename: 'lima_square.webp', variant: 'square' }])

      const summary = await backfillWidthLadder({ payload: payload as never, io, dryRun: true })

      expect(summary.rungsWritten).toBe(WIDTH_LADDER.length)
      expect(Object.keys(written)).toEqual([])
    },
    IMAGE_WORK_TIMEOUT_MS,
  )

  it(
    'reads media-assets without ever writing to the database',
    async () => {
      // There is no `update` or `create` on this payload stand-in, so a write
      // attempt would throw rather than pass silently.
      const { io } = makeIo({ 'lima_square.webp': await makeVariantFile('square') })
      const payload = makePayload([{ id: 1, filename: 'lima_square.webp', variant: 'square' }])

      const summary = await backfillWidthLadder({ payload: payload as never, io })

      expect(summary.failures).toEqual([])
      expect(payload.find).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'media-assets', overrideAccess: true }),
      )
    },
    IMAGE_WORK_TIMEOUT_MS,
  )
})
