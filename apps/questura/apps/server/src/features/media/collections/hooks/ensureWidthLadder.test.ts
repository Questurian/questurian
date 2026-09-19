import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

import { ensureWidthLadder } from './ensureWidthLadder'
import type { LadderIo } from '@/features/media/pipeline/backfill-width-ladder'
import { WIDTH_LADDER, ladderFilename } from '@/features/media/pipeline/width-ladder'

const IMAGE_WORK_TIMEOUT_MS = 30_000

const squareFile = async (): Promise<Buffer> =>
  sharp({ create: { width: 1080, height: 1080, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .webp()
    .toBuffer()

const makeIo = (files: Record<string, Buffer>) => {
  const written: Record<string, Buffer> = {}
  const io: LadderIo = {
    exists: async (name) => name in files || name in written,
    read: async (name) => {
      const file = files[name] ?? written[name]
      if (!file) throw new Error(`missing ${name}`)
      return file
    },
    write: async (name, buffer) => {
      written[name] = buffer
    },
  }
  return { io, written }
}

const req = () => ({ payload: { logger: { error: vi.fn() } } }) as never

const run = (io: LadderIo, doc: unknown, previousDoc?: unknown) =>
  ensureWidthLadder(io)({ doc, previousDoc, req: req() } as never)

describe('ensureWidthLadder', () => {
  it(
    'builds the rungs for a variant attached outside the pipeline',
    async () => {
      // `ensureMediaSetVariant` allows an uploaded asset to fill a MediaSet's
      // empty variant slot from the admin panel. That route never touches the
      // pipeline, so without this hook the file would have no rungs and the
      // client would name files that do not exist.
      const filename = 'lima-bar_square.webp'
      const { io, written } = makeIo({ [filename]: await squareFile() })

      await run(io, { id: 1, filename, variant: 'square' })

      expect(Object.keys(written).sort()).toEqual(
        WIDTH_LADDER.map((width) => ladderFilename(filename, width)).sort(),
      )
    },
    IMAGE_WORK_TIMEOUT_MS,
  )

  it('does no image work when the rungs already exist', async () => {
    const filename = 'lima-bar_square.webp'
    const { io } = makeIo(
      Object.fromEntries(WIDTH_LADDER.map((w) => [ladderFilename(filename, w), Buffer.from('x')])),
    )
    const read = vi.spyOn(io, 'read')

    await run(io, { id: 1, filename, variant: 'square' })

    // The common case is an asset the pipeline just handled. It must cost
    // HEADs and nothing more.
    expect(read).not.toHaveBeenCalled()
  })

  it('ignores a source upload, which has no variant and so no shape to resize to', async () => {
    const { io, written } = makeIo({ 'original.webp': Buffer.from('x') })
    await run(io, { id: 1, filename: 'original.webp', variant: null })
    expect(written).toEqual({})
  })

  it('never gives a rung a ladder of its own', async () => {
    const { io, written } = makeIo({ 'lima-bar_square_w384.webp': Buffer.from('x') })
    await run(io, { id: 1, filename: 'lima-bar_square_w384.webp', variant: 'square' })
    expect(written).toEqual({})
  })

  it('skips a metadata edit, which cannot have changed the bytes', async () => {
    const filename = 'lima-bar_square.webp'
    const { io, written } = makeIo({ [filename]: Buffer.from('x') })
    const exists = vi.spyOn(io, 'exists')

    await run(io, { id: 1, filename, variant: 'square', alt_text: 'new' }, { filename })

    expect(exists).not.toHaveBeenCalled()
    expect(written).toEqual({})
  })

  it(
    'logs and keeps the upload when Bunny refuses a rung',
    async () => {
      // Losing the upload would be worse than a photo that serves full size
      // until the backfill picks it up -- which is what readers saw before.
      const filename = 'lima-bar_square.webp'
      const { io } = makeIo({ [filename]: await squareFile() })
      io.write = async () => {
        throw new Error('Bunny said 503')
      }
      const request = req() as unknown as { payload: { logger: { error: ReturnType<typeof vi.fn> } } }

      const doc = { id: 1, filename, variant: 'square' }
      const result = await ensureWidthLadder(io)({ doc, req: request } as never)

      expect(result).toBe(doc)
      expect(request.payload.logger.error).toHaveBeenCalled()
    },
    IMAGE_WORK_TIMEOUT_MS,
  )
})
