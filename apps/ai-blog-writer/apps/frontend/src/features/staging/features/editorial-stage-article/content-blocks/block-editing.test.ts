import { describe, expect, it } from 'vitest'
import type { ContentBlock, EditorialBlock } from '../../../types'
import {
  findHeaderSplitPoints,
  insertContentBlock,
  mergeTextBlockWithNext,
  removeContentBlock,
  splitTextBlockAtLine
} from './block-editing'

const blocks: ContentBlock[] = [
  { id: 'intro', type: 'text', content: 'Intro copy.' },
  {
    id: 'details',
    type: 'text',
    content: 'Opening detail.\n\n## Planning\nPlan ahead.'
  },
  { id: 'ending', type: 'pullquote', content: 'Closing thought.' }
]

function editorialBlock(
  id: string,
  afterBlockId: string,
  placeAfterImage = false
): EditorialBlock {
  return {
    id,
    component: 'highlight_callout',
    label: 'Highlight',
    markdown: '> Callout',
    afterBlockId,
    placeAfterImage
  }
}

describe('content block editing', () => {
  it('finds non-leading markdown headers as valid split points', () => {
    expect(findHeaderSplitPoints(blocks[1].content)).toEqual([
      { lineIndex: 2, headerText: 'Planning' }
    ])
    expect(findHeaderSplitPoints('# Leading title\nBody')).toEqual([])
  })

  it('merges adjacent textual blocks and moves next-block editorial anchors', () => {
    const result = mergeTextBlockWithNext(
      blocks,
      [editorialBlock('callout', 'details')],
      'intro'
    )

    expect(result?.blocks).toEqual([
      {
        id: 'intro',
        type: 'text',
        content: 'Intro copy.\n\nOpening detail.\n\n## Planning\nPlan ahead.'
      },
      blocks[2]
    ])
    expect(result?.editorialBlocks[0].afterBlockId).toBe('intro')
  })

  it('splits a textual block and moves its editorial anchors after the new half', () => {
    const result = splitTextBlockAtLine(
      blocks,
      [editorialBlock('callout', 'details')],
      'details',
      2,
      () => 'details-second'
    )

    expect(result?.blocks.map((block) => [block.id, block.content])).toEqual([
      ['intro', 'Intro copy.'],
      ['details', 'Opening detail.'],
      ['details-second', '## Planning\nPlan ahead.'],
      ['ending', 'Closing thought.']
    ])
    expect(result?.editorialBlocks[0].afterBlockId).toBe('details-second')
  })

  it('rejects invalid insertion and split targets without changing the draft', () => {
    const newBlock: ContentBlock = {
      id: 'new',
      type: 'text',
      content: 'New copy.'
    }

    expect(insertContentBlock(blocks, newBlock, 'missing')).toBeNull()
    expect(
      splitTextBlockAtLine(blocks, [], 'details', 0, () => 'unused')
    ).toBeNull()
  })

  it('removes a block and reanchors editorial blocks to the previous block', () => {
    const result = removeContentBlock(
      blocks,
      [editorialBlock('callout', 'details', true)],
      'details'
    )

    expect(result?.blocks.map((block) => block.id)).toEqual(['intro', 'ending'])
    expect(result?.editorialBlocks[0]).toEqual(
      expect.objectContaining({
        afterBlockId: 'intro',
        placeAfterImage: false
      })
    )
  })
})
