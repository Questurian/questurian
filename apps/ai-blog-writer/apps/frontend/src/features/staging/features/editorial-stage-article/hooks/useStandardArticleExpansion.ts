import { useCallback, useState } from 'react'
import type { StagedArticle } from '../../../types'
import { useArticleExpansion } from '../../../../youtube2blog/hooks/useArticleExpansion'
import { parseMarkdownToBlocks } from '../workflow.service'

export function useStandardArticleExpansion(
  stagedArticle: StagedArticle | undefined,
  setStageArticle: (updates: Partial<StagedArticle>) => void,
) {
  const [isOpen, setIsOpen] = useState(false)
  const expansion = useArticleExpansion(stagedArticle?.runId ?? null)

  const open = useCallback(() => {
    if (!stagedArticle) return
    expansion.reset()
    expansion.startExpansion(
      stagedArticle.content,
      stagedArticle.originalType,
      stagedArticle.title || stagedArticle.originalTitle,
    )
    setIsOpen(true)
  }, [expansion, stagedArticle])

  const accept = useCallback((expandedMarkdown: string) => {
    const blocks = parseMarkdownToBlocks(expandedMarkdown)
    setStageArticle({ blocks, content: expandedMarkdown, lexicalConverted: false })
    expansion.reset()
    setIsOpen(false)
  }, [expansion, setStageArticle])

  const close = useCallback(() => {
    expansion.reset()
    setIsOpen(false)
  }, [expansion])

  return {
    ...expansion,
    isOpen,
    open,
    accept,
    close,
  }
}
