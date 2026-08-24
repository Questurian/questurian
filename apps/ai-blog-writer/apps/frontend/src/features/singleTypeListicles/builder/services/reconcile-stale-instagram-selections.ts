import {
  getRelatedInstagramPostObjects,
  resolveInstagramPermalink
} from '../../../../shared/builder/utils/item-media.utils'
import type { InstagramPostOption } from '../../../../shared/builder/types'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'

export function reconcileStaleInstagramSelections(
  draft: SingleTypeListicleDraft,
  relatedItems: RelatedItemOption[],
  selectedPosts: InstagramPostOption[]
): SingleTypeListicleDraft {
  const selectedPostById = new Map(selectedPosts.map((post) => [post.id, post]))
  let changed = false

  const items = draft.items.map((item) => {
    if (!item.item || !item.selectedInstagramPost) return item

    const relatedItem = relatedItems.find((entry) => entry.id === item.item)
    const currentPosts = getRelatedInstagramPostObjects(relatedItem)
    if (currentPosts.some((post) => post.id === item.selectedInstagramPost))
      return item

    const selectedPost = selectedPostById.get(item.selectedInstagramPost)
    if (!selectedPost) return item

    const selectedPermalink = resolveInstagramPermalink(selectedPost)
    if (!selectedPermalink) return item

    const replacement = currentPosts.find(
      (post) => resolveInstagramPermalink(post) === selectedPermalink
    )
    if (!replacement) return item

    changed = true
    return { ...item, selectedInstagramPost: replacement.id }
  })

  return changed ? { ...draft, items } : draft
}
