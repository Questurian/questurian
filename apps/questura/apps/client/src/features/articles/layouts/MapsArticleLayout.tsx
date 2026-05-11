'use client'

import type { JSX } from 'react'
import { MapsListicleArticlePage } from '@/features/articles/MapsListicleArticlePage'
import { ListicleArticleLayout } from '@/features/articles/layouts/ListicleArticleLayout'
import type { RelatedMapsArticleTeaser } from '@/features/articles/lib/fetchRelatedMapsArticles'
import type { MapsListicleArticle } from '@/features/articles/types/mapsListicle'

interface MapsArticleLayoutProps {
  article: MapsListicleArticle
  relatedArticles: RelatedMapsArticleTeaser[]
  country: string
  city?: string | null
}

export function MapsArticleLayout({
  article,
  relatedArticles,
  country,
  city,
}: MapsArticleLayoutProps): JSX.Element {
  return (
    <ListicleArticleLayout
      relatedArticles={relatedArticles}
      country={country}
      city={city}
    >
      <MapsListicleArticlePage article={article} />
    </ListicleArticleLayout>
  )
}
