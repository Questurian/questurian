import { describe, expect, it } from 'vitest'

import {
  augmentBlocksWithPublishStatus,
  getBlockPublishBlockers,
  snapshotDraftBlocksForPublish,
} from './publish-status'

type AnyBlock = Record<string, unknown>

function readyImage() {
  return { url: 'https://cdn.example/x.jpg', status: 'ready' }
}

function publishedArticleItem(overrides: AnyBlock = {}): AnyBlock {
  return {
    id: 1,
    title: 'Some article',
    status: 'published',
    image: readyImage(),
    imageHero: readyImage(),
    imageSquare: readyImage(),
    imageWide: readyImage(),
    ...overrides,
  }
}

/** A complete, publishable featured-articles block with one valid slot. */
function publishableBlock(overrides: AnyBlock = {}): AnyBlock {
  return {
    id: 'block-1',
    blockType: 'featured-articles',
    selection: {
      isComplete: true,
      items: [publishedArticleItem()],
    },
    ...overrides,
  }
}

describe('getBlockPublishBlockers', () => {
  it('returns no blockers for a complete, fully published block', () => {
    expect(getBlockPublishBlockers(publishableBlock(), 0)).toEqual([])
  })

  it('flags an incomplete selection', () => {
    const block = publishableBlock({ selection: { isComplete: false, items: [] } })
    const blockers = getBlockPublishBlockers(block, 0)
    expect(blockers).toHaveLength(1)
    expect(blockers[0]).toMatch(/incomplete/i)
  })

  it('flags an item that is not published', () => {
    const block = publishableBlock({
      selection: {
        isComplete: true,
        items: [publishedArticleItem({ status: 'draft', title: 'Draft piece' })],
      },
    })
    const blockers = getBlockPublishBlockers(block, 0)
    expect(blockers[0]).toMatch(/not published/i)
    expect(blockers[0]).toContain('Draft piece')
  })

  it('flags a missing ready image placement', () => {
    const block = publishableBlock({
      selection: {
        isComplete: true,
        items: [publishedArticleItem({ imageHero: { url: '', status: 'pending' } })],
      },
    })
    const blockers = getBlockPublishBlockers(block, 0)
    expect(blockers[0]).toMatch(/imageHero/)
  })

  it('does not require images for non-article block types', () => {
    const block = {
      id: 'b',
      blockType: 'newsletter-signup',
      selection: { isComplete: true, items: [] },
    }
    expect(getBlockPublishBlockers(block, 0)).toEqual([])
  })

  it('requires supporting copy for every location grid card', () => {
    const block = {
      blockType: 'location-grid',
      selection: {
        isComplete: true,
        items: [
          {
            id: 1,
            title: 'Miraflores',
            kicker: 'Neighborhood guides',
            description: 'Pacific views and destination dining.',
          },
          { id: 2, title: 'Barranco', kicker: 'Neighborhood guides', description: null },
        ],
      },
    }

    expect(getBlockPublishBlockers(block, 8)).toEqual([
      'Block 9, slot 2 is missing location supporting text.',
    ])
  })

  it('requires a kicker for every location grid card', () => {
    const block = {
      blockType: 'location-grid',
      selection: {
        isComplete: true,
        items: [{ id: 1, title: 'Miraflores', kicker: '', description: 'Pacific views.' }],
      },
    }

    expect(getBlockPublishBlockers(block, 8)).toEqual([
      'Block 9, slot 1 is missing location kicker.',
    ])
  })

  it('requires editorial feature copy, responsive image placements, and authored alt text', () => {
    const block = {
      blockType: 'editorial-feature',
      featureKicker: '',
      featureTitle: '',
      featureDescription: '',
      featureImagePortrait: null,
      featureImageWide: null,
      featureImageAltReady: false,
      selection: {
        isComplete: true,
        totalSlots: 3,
        items: [publishedArticleItem(), publishedArticleItem(), publishedArticleItem()],
      },
    }
    expect(getBlockPublishBlockers(block, 1)).toEqual(
      expect.arrayContaining([
        'Block 2 is missing its Feature kicker.',
        'Block 2 is missing its feature title.',
        'Block 2 is missing its feature description.',
        'Block 2 feature image is missing a ready portrait placement.',
        'Block 2 feature image is missing a ready wide placement.',
        'Block 2 feature image is missing authored alt text.',
      ]),
    )
  })

  it('does not require article images for the six-title editorial feature layout', () => {
    const block = {
      blockType: 'editorial-feature',
      featureKicker: 'Featured Destination',
      featureTitle: 'Miraflores',
      featureDescription: 'A neighborhood guide.',
      featureImagePortrait: readyImage(),
      featureImageWide: readyImage(),
      featureImageAltReady: true,
      selection: {
        isComplete: true,
        totalSlots: 6,
        items: Array.from({ length: 6 }, () =>
          publishedArticleItem({ image: null, imageSquare: null, imageWide: null }),
        ),
      },
    }
    expect(getBlockPublishBlockers(block, 0)).toEqual([])
  })
})

describe('snapshotDraftBlocksForPublish', () => {
  it('strips ids and records each draft id as sourceBlockKey', () => {
    const snapshot = snapshotDraftBlocksForPublish([
      { id: 'draft-1', blockType: 'featured-articles', sectionHeading: 'A' },
      { id: 'draft-2', blockType: 'newsletter-signup' },
    ]) as AnyBlock[]

    expect(snapshot[0].id).toBeUndefined()
    expect(snapshot[0].sourceBlockKey).toBe('draft-1')
    expect(snapshot[0].sectionHeading).toBe('A')
    expect(snapshot[1].sourceBlockKey).toBe('draft-2')
  })

  it('returns an empty array for non-array input', () => {
    expect(snapshotDraftBlocksForPublish(undefined)).toEqual([])
  })
})

describe('augmentBlocksWithPublishStatus', () => {
  const scope = () => {
    const rawDraft = [
      { id: 'd1', blockType: 'featured-articles', sectionHeading: 'Live one' },
      { id: 'd2', blockType: 'featured-articles', sectionHeading: 'Edited' },
      { id: 'd3', blockType: 'featured-articles', sectionHeading: 'Brand new' },
    ]
    const rawPublished = [
      {
        id: 'p1',
        sourceBlockKey: 'd1',
        blockType: 'featured-articles',
        sectionHeading: 'Live one',
      },
      {
        id: 'p2',
        sourceBlockKey: 'd2',
        blockType: 'featured-articles',
        sectionHeading: 'Old text',
      },
    ]
    // Resolved blocks are index-aligned with rawDraft; all complete/publishable here.
    const resolvedDraft = rawDraft.map((raw) => ({
      id: raw.id,
      blockType: raw.blockType,
      selection: { isComplete: true, items: [] },
    }))
    return { rawDraft, rawPublished, resolvedDraft }
  }

  it('marks unchanged blocks live, changed blocks modified, and new blocks unpublished', () => {
    const { rawDraft, rawPublished, resolvedDraft } = scope()
    const result = augmentBlocksWithPublishStatus(resolvedDraft, rawDraft, rawPublished)

    expect(result[0].publishStatus).toBe('live')
    expect(result[1].publishStatus).toBe('modified')
    expect(result[2].publishStatus).toBe('unpublished')
  })

  it('attaches validationStatus and blockers from the publish rules', () => {
    const rawDraft = [{ id: 'd1', blockType: 'featured-articles' }]
    const resolvedDraft = [
      {
        id: 'd1',
        blockType: 'featured-articles',
        selection: {
          isComplete: true,
          items: [{ id: 9, title: 'Nope', status: 'draft', imageHero: readyImage() }],
        },
      },
    ]
    const [block] = augmentBlocksWithPublishStatus(resolvedDraft, rawDraft, [])
    expect(block.validationStatus).toBe('blocked')
    expect(block.publishBlockers?.[0]).toMatch(/not published/i)
    expect(block.publishStatus).toBe('unpublished')
  })

  it('ignores id/sourceBlockKey when comparing content', () => {
    const rawDraft = [{ id: 'dX', blockType: 'featured-articles', sectionHeading: 'Same' }]
    const rawPublished = [
      { id: 'pX', sourceBlockKey: 'dX', blockType: 'featured-articles', sectionHeading: 'Same' },
    ]
    const resolvedDraft = [
      { id: 'dX', blockType: 'featured-articles', selection: { isComplete: true, items: [] } },
    ]
    const [block] = augmentBlocksWithPublishStatus(resolvedDraft, rawDraft, rawPublished)
    expect(block.publishStatus).toBe('live')
  })
})
