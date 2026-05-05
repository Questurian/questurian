import type { JSX } from 'react'
import { MapsListicleArticlePage } from '@/features/articles/MapsListicleArticlePage'
import type { MapsListicleArticle } from '@/features/articles/types/mapsListicle'

export function MapsArticleLayout({
  article,
}: {
  article: MapsListicleArticle
}): JSX.Element {
  return (
    <div data-article-layout="maps">
      <MapsListicleArticlePage article={article} />
    </div>
  )
}
