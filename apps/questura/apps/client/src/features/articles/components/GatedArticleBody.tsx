'use client'

import { BlockRenderer } from '@/features/articles/components/BlockRenderer'
import { GatedBodySkeleton, GatedLoadError } from '@/features/articles/components/GatedStates'
import { PaywallNotice } from '@/features/articles/components/PaywallNotice'
import type { GateState } from '@/features/articles/lib/gate'
import { useGatedFullArticle } from '@/features/articles/lib/useGatedFullArticle'
import type { ContentBlock } from '@/features/articles/types'

type GatedArticleBodyProps = {
  articleId: number
  gate: GateState
  /** Path the reader is on, so checkout can return them to it. */
  path: string
  lang?: string
}

type FullArticleResponse = {
  contentBlocks?: ContentBlock[]
}

/**
 * The locked region of a gated standard article.
 *
 * Client-side because the cached public shell is `force-static`, where
 * `cookies()` is empty by construction -- no page under it can know who is
 * reading (ADR-0009).
 */
export function GatedArticleBody({ articleId, gate, path, lang }: GatedArticleBodyProps) {
  const { phase, data, retry } = useGatedFullArticle<FullArticleResponse>({
    articleId,
    type: 'articles',
    enabled: true,
    lang,
  })

  // The notice is what the server renders and what the browser renders first,
  // so the two agree and hydration is stable. A member sees it briefly before
  // the swap; that is the correct trade, because the alternative puts a
  // loading placeholder in the cached HTML where a crawler and any reader
  // without JS would find the call to action -- and `[data-paywalled]`, which
  // the page's paywall JSON-LD points at, lives on this notice.
  if (phase === 'identifying' || phase === 'anonymous') {
    return <PaywallNotice gate={gate} returnTo={path} />
  }

  if (phase === 'loading') {
    return <GatedBodySkeleton />
  }

  if (phase === 'failed' || !data?.contentBlocks) {
    return <GatedLoadError onRetry={retry} />
  }

  // The full body includes the sample blocks the server already rendered, so
  // the sample is dropped here rather than duplicated above this component.
  const remaining = data.contentBlocks.slice(gate.shown)

  return (
    <>
      {remaining.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </>
  )
}
