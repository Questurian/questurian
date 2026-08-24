import { describe, expect, it } from 'vitest'
import type { InstagramPostOption } from '../../../../shared/builder/types'
import { createEmptyDraft } from '../../storage'
import type { RelatedItemOption } from '../../types'
import { reconcileStaleInstagramSelections } from './reconcile-stale-instagram-selections'

describe('reconcileStaleInstagramSelections', () => {
  it('repoints a stale selection to current gallery post with same permalink', () => {
    const draft = createEmptyDraft()
    draft.items = [
      {
        id: 'item-1',
        blockType: 'data-dining',
        item: 264,
        tours: [],
        mediaMode: 'both',
        selectedPhotos: [530],
        selectedInstagramPost: 453,
        blurbMarkdown: 'Existing copy'
      }
    ]

    const relatedItems = [
      {
        id: 264,
        title: 'Astrid y Gastón',
        instagramGallery: [
          {
            post: {
              id: 2016,
              title: 'Current post',
              embedCode:
                '<blockquote data-instgrm-permalink="https://www.instagram.com/p/DRFUZfokSjN/?utm_source=ig_embed"></blockquote>'
            }
          }
        ]
      }
    ] as RelatedItemOption[]
    const stalePosts = [
      {
        id: 453,
        title: 'Legacy post',
        embedCode:
          '<blockquote data-instgrm-permalink="https://www.instagram.com/p/DRFUZfokSjN/?utm_source=ig_embed"></blockquote>'
      }
    ] as InstagramPostOption[]

    const next = reconcileStaleInstagramSelections(
      draft,
      relatedItems,
      stalePosts
    )

    expect(next.items[0].selectedInstagramPost).toBe(2016)
    expect(next.items[0].blurbMarkdown).toBe('Existing copy')
  })
})
