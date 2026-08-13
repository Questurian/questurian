import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  articleGridFourLayoutForBlock,
  slot3LayoutForBlock,
  slot4LayoutForBlock,
  slot5LayoutForBlock,
} from './curatedHomepageLayouts'
import type {
  ArticleCuratedHomepageBlockResponse,
  ArticleGridFourLayout,
  FeaturedArticlesSlot3Layout,
  FeaturedArticlesSlot4Layout,
  FeaturedArticlesSlot5Layout,
} from './pageBlocks'

function usePersistedLayoutDraft<T extends string>(
  savedValue: T,
  save: ((value: T) => Promise<void>) | undefined,
) {
  const [draft, setDraft] = useState(savedValue)

  useEffect(() => {
    setDraft(savedValue)
  }, [savedValue])

  const mutation = useMutation({
    mutationFn: async (value: T) => {
      if (!save) return
      await save(value)
    },
  })

  return {
    draft,
    setDraft,
    savedValue,
    dirty: draft !== savedValue,
    mutation,
  }
}

type Params = {
  block: ArticleCuratedHomepageBlockResponse
  saveSlot3Layout?: (value: FeaturedArticlesSlot3Layout) => Promise<void>
  saveSlot4Layout?: (value: FeaturedArticlesSlot4Layout) => Promise<void>
  saveSlot5Layout?: (value: FeaturedArticlesSlot5Layout) => Promise<void>
  saveArticleGridFourLayout?: (value: ArticleGridFourLayout) => Promise<void>
}

export function useCuratedHomepageLayouts({
  block,
  saveSlot3Layout,
  saveSlot4Layout,
  saveSlot5Layout,
  saveArticleGridFourLayout,
}: Params) {
  const slot3 = usePersistedLayoutDraft(slot3LayoutForBlock(block), saveSlot3Layout)
  const slot4 = usePersistedLayoutDraft(slot4LayoutForBlock(block), saveSlot4Layout)
  const slot5 = usePersistedLayoutDraft(slot5LayoutForBlock(block), saveSlot5Layout)
  const articleGridFour = usePersistedLayoutDraft(
    articleGridFourLayoutForBlock(block),
    saveArticleGridFourLayout,
  )

  return { slot3, slot4, slot5, articleGridFour }
}

export type CuratedHomepageLayoutsState = ReturnType<typeof useCuratedHomepageLayouts>
