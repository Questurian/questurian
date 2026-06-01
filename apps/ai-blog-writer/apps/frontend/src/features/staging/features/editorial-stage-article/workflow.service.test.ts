import { describe, expect, it } from 'vitest'
import type { ContentBlock, EditorialBlock } from '../../types'
import {
  applyTimelineItemsToDraft,
  attachEditorialBlocksToContentBlocks,
  buildTimelineItems,
  composeArticleMarkdown,
  migrateEditorialBlocksForStandaloneMedia,
  normalizeBlocks,
  parseMarkdownToBlocksDetailed,
} from './workflow.service'

function buildEditorialBlock(overrides: Partial<EditorialBlock> = {}): EditorialBlock {
  return {
    id: 'editorial-1',
    component: 'highlight_callout',
    label: 'Why This Matters',
    markdown: '> [!EDITORIAL-BLOCK-START|highlight_callout]\n> Useful context.\n> [!EDITORIAL-BLOCK-END|highlight_callout]',
    ...overrides,
  }
}

describe('editorial article workflow', () => {
  it('parses markdown sections and preserves source ranges after a leading title', () => {
    const result = parseMarkdownToBlocksDetailed([
      '# Article title',
      '',
      'Intro copy.',
      '',
      '## First section',
      'First body.',
      '',
      '## Second section',
      'Second body.',
    ].join('\n'))

    expect(result.blocks.map((block) => block.content)).toEqual([
      'Intro copy.',
      '## First section\nFirst body.',
      '## Second section\nSecond body.',
    ])
    expect(result.ranges).toEqual([
      { id: 'block_0', startLine: 2, endLine: 3 },
      { id: 'block_1', startLine: 4, endLine: 6 },
      { id: 'block_2', startLine: 7, endLine: 8 },
    ])
  })

  it('extracts legacy inline media and migrates editorial placement to the media block', () => {
    const normalized = normalizeBlocks([
      {
        id: 'intro',
        type: 'text',
        content: 'Intro copy.',
        imageAfter: 42,
        imageAfterAltText: '  Harbor view  ',
      },
    ], '')

    expect(normalized.blocks).toEqual([
      {
        id: 'intro',
        type: 'text',
        content: 'Intro copy.',
        imageAfter: undefined,
        imageAfterAltText: undefined,
        imgPairAfter: undefined,
        imgTrioAfter: undefined,
      },
      {
        id: 'intro__image',
        type: 'image',
        content: '',
        imageAfter: 42,
        imageAfterAltText: 'Harbor view',
      },
    ])

    expect(migrateEditorialBlocksForStandaloneMedia([
      buildEditorialBlock({
        afterBlockId: 'intro',
        placeAfterImage: true,
      }),
    ], normalized.mediaBlockIdByLegacyAnchorId)).toEqual([
      expect.objectContaining({
        id: 'editorial-1',
        afterBlockId: 'intro__image',
        placeAfterImage: false,
      }),
    ])
  })

  it('attaches editorial blocks by markdown anchor and composes them after the matched section', () => {
    const blocks: ContentBlock[] = [
      { id: 'intro', type: 'text', content: 'Intro copy.' },
      { id: 'details', type: 'text', content: '## Details\nMore copy.' },
    ]
    const editorialBlocks = attachEditorialBlocksToContentBlocks(
      blocks,
      [
        { id: 'intro', startLine: 0, endLine: 1 },
        { id: 'details', startLine: 2, endLine: 3 },
      ],
      [buildEditorialBlock({ anchorLine: 2 })]
    )

    expect(editorialBlocks[0].afterBlockId).toBe('intro')
    expect(composeArticleMarkdown(blocks, editorialBlocks)).toBe([
      'Intro copy.',
      buildEditorialBlock().markdown,
      '## Details\nMore copy.',
    ].join('\n\n'))
  })

  it('projects reordered timeline items back into block order and image-aware editorial placement', () => {
    const blocks: ContentBlock[] = [
      { id: 'intro', type: 'text', content: 'Intro copy.' },
      { id: 'photo', type: 'image', content: '', imageAfter: 42 },
      { id: 'details', type: 'text', content: 'Details copy.' },
    ]
    const editorialBlock = buildEditorialBlock({ afterBlockId: 'details' })
    const timelineItems = buildTimelineItems(blocks, [editorialBlock])
    const reordered = [
      timelineItems[0],
      timelineItems[1],
      timelineItems[3],
      timelineItems[2],
    ]

    const result = applyTimelineItemsToDraft(reordered, blocks, [editorialBlock])

    expect(result.blocks.map((block) => block.id)).toEqual(['intro', 'photo', 'details'])
    expect(result.editorialBlocks).toEqual([
      expect.objectContaining({
        id: 'editorial-1',
        afterBlockId: 'photo',
        placeAfterImage: true,
      }),
    ])
  })
})
