import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY } from '@/features/media/collections/hooks/syncBunnyOriginalUrl'
import { MEDIA_VARIANT_KEYS } from '@/features/media/constants'
import { assembleMediaSetFromSource } from './assemble-media-set'

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
  })
})
