import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

import {
  backfillAssetLadder,
  backfillWidthLadder,
  backfillZoneLadder,
  ladderFromVariantFile,
  variantFromFilename,
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
    list: async () => [...Object.keys(files), ...Object.keys(written)],
    exists: async (filename) => filename in files || filename in written,
    read: async (filename) => {
      const file = files[filename] ?? written[filename]
      if (!file) throw new Error(`missing ${filename}`)
      return file
    },
    write: async (filename, buffer) => {
      written[filename] = buffer
    },
    remove: async (filename) => {
      delete written[filename]
      delete files[filename]
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

describe('variantFromFilename', () => {
  it('reads the shape the same way the client does', () => {
    // Both sides agreeing on this one rule is what makes the job cover exactly
    // the files the client will go on to ask about.
    expect(variantFromFilename('lima-bar-12_square.webp')).toBe('square')
    expect(variantFromFilename('christ-the-redeemer_1775875880053_thumbnail.webp')).toBe('thumbnail')
    expect(variantFromFilename('a_open_graph.webp')).toBe('open_graph')
  })

  it('declines anything without a shape to resize against', () => {
    expect(variantFromFilename('source-0-61-1021.webp')).toBeNull()
    expect(variantFromFilename('legacy_banner.webp')).toBeNull()
    expect(variantFromFilename('lima-bar-12_square_w384.webp')).toBeNull()
  })
})

describe('backfillZoneLadder', () => {
  it(
    'ladders every variant the zone holds and steps over everything else',
    async () => {
      // Driven by the storage zone rather than by rows: the client asks for a
      // rung because it recognized a filename, so the zone is the set that
      // matters, and no database is consulted at all.
      const { io, written } = makeIo({
        'lima_square.webp': await makeVariantFile('square'),
        'lima_wide.webp': await makeVariantFile('wide'),
        'source-1069.webp': Buffer.from('x'),
        'lima_square_w128.webp': Buffer.from('x'),
      })

      const summary = await backfillZoneLadder({ io })

      expect(summary.assetsVisited).toBe(2)
      // The source upload and the rung that already existed.
      expect(summary.assetsSkipped).toBe(2)
      // The square already had its 128, so it needed four not five.
      expect(summary.rungsWritten).toBe(WIDTH_LADDER.length * 2 - 1)
      expect(Object.keys(written)).toContain(ladderFilename('lima_wide.webp', 960))
    },
    IMAGE_WORK_TIMEOUT_MS,
  )

  it(
    'writes nothing on a dry run',
    async () => {
      const { io, written } = makeIo({ 'lima_square.webp': await makeVariantFile('square') })
      const summary = await backfillZoneLadder({ io, dryRun: true })
      expect(summary.rungsWritten).toBe(WIDTH_LADDER.length)
      expect(Object.keys(written)).toEqual([])
    },
    IMAGE_WORK_TIMEOUT_MS,
  )
})

describe('the zone pass at scale', () => {
  it('answers "does this rung exist" from the listing, not the network', async () => {
    // Five HEADs per photo is five round trips before any work starts. Across
    // six thousand photos that alone was the difference between minutes and
    // days, and the listing already holds the answer.
    const { io } = makeIo({
      'lima_square.webp': Buffer.from('x'),
      ...Object.fromEntries(
        WIDTH_LADDER.map((w) => [ladderFilename('lima_square.webp', w), Buffer.from('x')]),
      ),
    })
    const exists = vi.spyOn(io, 'exists')

    const summary = await backfillZoneLadder({ io })

    expect(exists).not.toHaveBeenCalled()
    expect(summary.rungsAlreadyPresent).toBe(WIDTH_LADDER.length)
    expect(summary.rungsWritten).toBe(0)
  })

  it(
    'works through the queue in parallel without dropping or repeating a file',
    async () => {
      const files: Record<string, Buffer> = {}
      const square = await makeVariantFile('square')
      for (let i = 0; i < 25; i += 1) files[`photo-${i}_square.webp`] = square
      const { io, written } = makeIo(files)

      let inFlight = 0
      let peak = 0
      const realRead = io.read
      io.read = async (name) => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
        return realRead(name)
      }

      const summary = await backfillZoneLadder({ io, concurrency: 8 })

      expect(peak).toBeGreaterThan(1)
      expect(summary.assetsVisited).toBe(25)
      expect(Object.keys(written)).toHaveLength(25 * WIDTH_LADDER.length)
    },
    IMAGE_WORK_TIMEOUT_MS,
  )
})
