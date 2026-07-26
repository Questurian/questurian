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
  token: string | null,
  save: ((token: string, value: T) => Promise<void>) | undefined,
) {
  const [draft, setDraft] = useState(savedValue)

  useEffect(() => {
    setDraft(savedValue)
  }, [savedValue])

  const mutation = useMutation({
    mutationFn: async (value: T) => {
      if (!token || !save) return
      await save(token, value)
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
  token: string | null
  saveSlot3Layout?: (token: string, value: FeaturedArticlesSlot3Layout) => Promise<void>
  saveSlot4Layout?: (token: string, value: FeaturedArticlesSlot4Layout) => Promise<void>
  saveSlot5Layout?: (token: string, value: FeaturedArticlesSlot5Layout) => Promise<void>
  saveArticleGridFourLayout?: (token: string, value: ArticleGridFourLayout) => Promise<void>
}

export function useCuratedHomepageLayouts({
  block,
  token,
  saveSlot3Layout,
  saveSlot4Layout,
  saveSlot5Layout,
  saveArticleGridFourLayout,
}: Params) {
  const slot3 = usePersistedLayoutDraft(slot3LayoutForBlock(block), token, saveSlot3Layout)
  const slot4 = usePersistedLayoutDraft(slot4LayoutForBlock(block), token, saveSlot4Layout)
  const slot5 = usePersistedLayoutDraft(slot5LayoutForBlock(block), token, saveSlot5Layout)
  const articleGridFour = usePersistedLayoutDraft(
    articleGridFourLayoutForBlock(block),
    token,
    saveArticleGridFourLayout,
  )

  return { slot3, slot4, slot5, articleGridFour }
}

export type CuratedHomepageLayoutsState = ReturnType<typeof useCuratedHomepageLayouts>
