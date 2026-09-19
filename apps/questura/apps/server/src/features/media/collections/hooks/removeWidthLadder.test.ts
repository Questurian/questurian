import { describe, expect, it, vi } from 'vitest'

import { removeWidthLadder } from './removeWidthLadder'
import type { LadderIo } from '@/features/media/pipeline/backfill-width-ladder'
import { WIDTH_LADDER, ladderFilename } from '@/features/media/pipeline/width-ladder'

const makeIo = () => {
  const removed: string[] = []
  const io = {
    exists: async () => true,
    read: async () => Buffer.from('x'),
    write: async () => undefined,
    remove: async (name: string) => {
      removed.push(name)
    },
  } satisfies LadderIo
  return { io, removed }
}

const req = () => ({ payload: { logger: { error: vi.fn() } } }) as never

describe('removeWidthLadder', () => {
  it('takes the rungs down with the variant they belong to', async () => {
    // Rungs have no MediaAsset row, so Payload's own delete cannot see them.
    const filename = 'lima-bar-12-1700_square.webp'
    const { io, removed } = makeIo()

    await removeWidthLadder(io)({ doc: { filename, variant: 'square' }, req: req() } as never)

    expect(removed).toEqual(WIDTH_LADDER.map((width) => ladderFilename(filename, width)))
  })

  it('leaves a source upload alone', async () => {
    const { io, removed } = makeIo()
    await removeWidthLadder(io)({ doc: { filename: 'original.webp' }, req: req() } as never)
    expect(removed).toEqual([])
  })

  it('does not try to ladder a rung', async () => {
    const { io, removed } = makeIo()
    await removeWidthLadder(io)({
      doc: { filename: 'lima-bar_square_w384.webp', variant: 'square' },
      req: req(),
    } as never)
    expect(removed).toEqual([])
  })

  it('keeps going, and says so, when one rung will not delete', async () => {
    // A leaked file costs a fraction of a cent; a delete that refuses to finish
    // leaves a MediaSet half torn down.
    const filename = 'lima-bar-12-1700_square.webp'
    const { io, removed } = makeIo()
    const realRemove = io.remove
    io.remove = async (name: string) => {
      if (name.endsWith('_w256.webp')) throw new Error('Bunny said 503')
      return realRemove(name)
    }
    const request = req() as unknown as { payload: { logger: { error: ReturnType<typeof vi.fn> } } }

    await removeWidthLadder(io)({ doc: { filename, variant: 'square' }, req: request } as never)

    expect(removed).toHaveLength(WIDTH_LADDER.length - 1)
    expect(request.payload.logger.error).toHaveBeenCalledTimes(1)
  })
})
