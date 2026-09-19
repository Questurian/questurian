import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

import { BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY } from '@/features/media/collections/hooks/syncBunnyOriginalUrl'
import { MEDIA_VARIANT_KEYS } from '@/features/media/constants'
import { assembleMediaSetFromSource } from './assemble-media-set'
import { WIDTH_LADDER, ladderFilename } from './width-ladder'

const makeSource = async (): Promise<Buffer> =>
  sharp({
    create: {
      width: 2400,
      height: 1600,
      channels: 3,
      background: { r: 20, g: 120, b: 180 },
    },
  })
    .jpeg()
    .toBuffer()

/**
 * Real libvips work — see the note in `from-source.test.ts`. This test builds a
 * 2400x1600 source and every variant off it, which makes it one of the three
 * slowest tests in the suite and the only one in this file. vitest's 5s default
 * flaked it on a loaded machine; raised here per test so the default still
 * guards everything else.
 */
const IMAGE_WORK_TIMEOUT_MS = 30_000

describe('assembleMediaSetFromSource', () => {
  it('skips legacy Bunny URL sync while creating source and variant media assets', async () => {
    const createCalls: Array<Record<string, unknown>> = []
    const payload = {
      create: async (args: Record<string, unknown>) => {
        createCalls.push(args)
        return { id: createCalls.length }
      },
    }

    const result = await assembleMediaSetFromSource({
      payload: payload as any,
      source: {
        buffer: await makeSource(),
        mimetype: 'image/jpeg',
        filename: 'hotel-source.jpg',
      },
      metadata: {
        title: 'Hotel Gallery',
        alt_text: 'Hotel gallery image',
        photographer_credit: 'Test Credit',
        externalRef: 'location-1-imageset-1',
      },
    })

    expect(result.sourceAssetId).toBe(1)
    expect(Object.keys(result.variantAssetIds).sort()).toEqual([...MEDIA_VARIANT_KEYS].sort())

    const mediaAssetCreates = createCalls.filter((call) => call.collection === 'media-assets')
    expect(mediaAssetCreates).toHaveLength(1 + MEDIA_VARIANT_KEYS.length)
    for (const call of mediaAssetCreates) {
      expect(call.context).toMatchObject({
        [BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY]: true,
      })
    }
  }, IMAGE_WORK_TIMEOUT_MS)
})

/**
 * What a brand-new upload sends to Bunny.
 *
 * This is the question an editor actually has: they crop their seven shapes as
 * they always did, and nothing asks them about widths. Location Manager posts
 * the source to `/api/media-sets/from-source`, which is a thin wrapper over
 * this function, so whatever this uploads is what a new photo gets.
 */
describe('a new upload, end to end', () => {
  const previousKey = process.env.BUNNY_STORAGE_API_KEY
  const previousZone = process.env.BUNNY_STORAGE_ZONE_NAME
  let uploaded: string[]

  beforeEach(() => {
    process.env.BUNNY_STORAGE_API_KEY = 'test-key'
    process.env.BUNNY_STORAGE_ZONE_NAME = 'test-zone'
    uploaded = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { method?: string }) => {
        if (init?.method === 'PUT') uploaded.push(decodeURIComponent(String(url).split('/media/')[1]))
        return { ok: true, status: 200 } as Response
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (previousKey === undefined) delete process.env.BUNNY_STORAGE_API_KEY
    else process.env.BUNNY_STORAGE_API_KEY = previousKey
    if (previousZone === undefined) delete process.env.BUNNY_STORAGE_ZONE_NAME
    else process.env.BUNNY_STORAGE_ZONE_NAME = previousZone
  })

  it(
    'uploads every rung for every shape without being asked',
    async () => {
      const payload = { create: async () => ({ id: 1 }) }

      await assembleMediaSetFromSource({
        payload: payload as never,
        source: { buffer: await makeSource(), mimetype: 'image/jpeg', filename: 'hotel-source.jpg' },
        metadata: { title: 'Hotel Gallery' },
      })

      // Seven shapes, each with its own five rungs, from one upload.
      const expected = MEDIA_VARIANT_KEYS.flatMap((variant) => {
        const file = `hotel-source-1_${variant}.webp`
        return [file, ...WIDTH_LADDER.map((width) => ladderFilename(file, width))]
      })

      expect(uploaded.sort()).toEqual(expected.sort())
      expect(uploaded).toHaveLength(
        MEDIA_VARIANT_KEYS.length * (1 + WIDTH_LADDER.length),
      )
    },
    IMAGE_WORK_TIMEOUT_MS,
  )

  it(
    'still creates exactly one MediaAsset row per shape, and none for a rung',
    async () => {
      // The rungs are files, not records. Seven crops in, seven rows out plus
      // the source -- an editor's library does not grow six times over.
      const created: Array<Record<string, unknown>> = []
      const payload = {
        create: async (args: Record<string, unknown>) => {
          created.push(args)
          return { id: created.length }
        },
      }

      await assembleMediaSetFromSource({
        payload: payload as never,
        source: { buffer: await makeSource(), mimetype: 'image/jpeg', filename: 'hotel-source.jpg' },
        metadata: { title: 'Hotel Gallery' },
      })

      const assetRows = created.filter((c) => c.collection === 'media-assets')
      expect(assetRows).toHaveLength(1 + MEDIA_VARIANT_KEYS.length)
    },
    IMAGE_WORK_TIMEOUT_MS,
  )
})
