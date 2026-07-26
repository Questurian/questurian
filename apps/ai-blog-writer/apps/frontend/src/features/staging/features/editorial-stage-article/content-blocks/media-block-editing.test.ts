import { describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../../../api'
import type { ContentBlock, EditorialBlock } from '../../../types'
import {
  removeMediaBlock,
  updateMediaGroupBlockCaption
} from './media-block-editing'
import {
  insertOrReplaceImgPairBlock,
  insertOrReplaceSingleImageBlock
} from './media-block-insertion'

const imageOne = { id: 11 } as MediaAsset
const imageTwo = { id: 12 } as MediaAsset

function editorialBlock(afterBlockId: string): EditorialBlock {
  return {
    id: 'editorial',
    component: 'highlight_callout',
    label: 'Highlight',
    markdown: '> Callout',
    afterBlockId,
    placeAfterImage: true
  }
}

describe('media block editing', () => {
  it('appends a single-image block when its requested anchor is missing', () => {
    const createBlockId = vi.fn(() => 'media-new')
    const blocks: ContentBlock[] = [
      { id: 'intro', type: 'text', content: 'Intro.' }
    ]

    const result = insertOrReplaceSingleImageBlock(
      blocks,
      'missing',
      createBlockId,
      42,
      ' Harbor view '
    )

    expect(result).toEqual({
      blocks: [
        blocks[0],
        {
          id: 'media-new',
          type: 'image',
          content: '',
          imageAfter: 42,
          imageAfterAltText: 'Harbor view'
        }
      ],
      insertedBlockId: 'media-new'
    })
    expect(createBlockId).toHaveBeenCalledOnce()
  })

  it('replaces a standalone media block without allocating a new id', () => {
    const createBlockId = vi.fn(() => 'unused')
    const blocks: ContentBlock[] = [
      {
        id: 'pair',
        type: 'img-pair',
        content: '',
        imgPairAfter: { imageOne: 1, imageTwo: 2 }
      }
    ]

    const result = insertOrReplaceImgPairBlock(
      blocks,
      'pair',
      createBlockId,
      imageOne,
      imageTwo,
      ' Updated ',
      true
    )

    expect(result).toEqual([
      {
        id: 'pair',
        type: 'img-pair',
        content: '',
        imgPairAfter: {
          imageOne: 11,
          imageTwo: 12,
          caption: 'Updated'
        }
      }
    ])
    expect(createBlockId).not.toHaveBeenCalled()
  })

  it('removes a standalone media block and reanchors editorial placement', () => {
    const blocks: ContentBlock[] = [
      { id: 'intro', type: 'text', content: 'Intro.' },
      { id: 'photo', type: 'image', content: '', imageAfter: 42 },
      { id: 'details', type: 'text', content: 'Details.' }
    ]

    const result = removeMediaBlock(
      blocks,
      [editorialBlock('photo')],
      'photo',
      'image'
    )

    expect(result.blocks.map((block) => block.id)).toEqual(['intro', 'details'])
    expect(result.editorialBlocks?.[0]).toEqual(
      expect.objectContaining({
        afterBlockId: 'intro',
        placeAfterImage: false
      })
    )
  })

  it('clears legacy inline media without emitting an editorial-block update', () => {
    const blocks: ContentBlock[] = [
      {
        id: 'intro',
        type: 'text',
        content: 'Intro.',
        imageAfter: 42,
        imageAfterAltText: 'Harbor'
      }
    ]

    expect(
      removeMediaBlock(blocks, [editorialBlock('intro')], 'intro', 'image')
    ).toEqual({
      blocks: [
        {
          id: 'intro',
          type: 'text',
          content: 'Intro.',
          imageAfter: undefined,
          imageAfterAltText: undefined
        }
      ]
    })
  })

  it('updates legacy and standalone group captions with their existing semantics', () => {
    const blocks: ContentBlock[] = [
      {
        id: 'standalone',
        type: 'img-pair',
        content: '',
        imgPairAfter: { imageOne: 1, imageTwo: 2 }
      },
      {
        id: 'legacy',
        type: 'text',
        content: 'Legacy.',
        imgPairAfter: { imageOne: 3, imageTwo: 4 }
      }
    ]

    expect(
      updateMediaGroupBlockCaption(blocks, 'standalone', '  Caption  ')[0]
        .imgPairAfter?.caption
    ).toBe('Caption')
    expect(
      updateMediaGroupBlockCaption(blocks, 'legacy', '  Caption  ')[1]
        .imgPairAfter?.caption
    ).toBe('  Caption  ')
  })
})
