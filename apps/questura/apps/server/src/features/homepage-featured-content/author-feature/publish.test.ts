import { describe, expect, it } from 'vitest'

import { getAuthorFeaturePublishBlockers } from './publish'

const readyImage = { status: 'ready', url: '/author.webp' }

function blockWithArticleAuthor(articleAuthorId: number) {
  return {
    authorCard: {
      author: { id: 7, href: '/authors/alan' },
      image: readyImage,
      imageSquare: readyImage,
      imageAltReady: true,
    },
    selection: { items: [{ author: { id: articleAuthorId } }] },
  }
}

describe('getAuthorFeaturePublishBlockers', () => {
  it('blocks a stale article rail after the Author is replaced', () => {
    expect(getAuthorFeaturePublishBlockers(blockWithArticleAuthor(9), 0)).toContain(
      'Block 1 contains an article not written by its selected Author.',
    )
  })

  it('accepts articles written by the selected Author', () => {
    expect(getAuthorFeaturePublishBlockers(blockWithArticleAuthor(7), 0)).toEqual([])
  })
})
