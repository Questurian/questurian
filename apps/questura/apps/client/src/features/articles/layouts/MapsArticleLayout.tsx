'use client'

import type { JSX } from 'react'
import { MapsListicleArticlePage } from '@/features/articles/MapsListicleArticlePage'
import type { MapsListicleArticle } from '@/features/articles/types/mapsListicle'
import { MapPanel } from '@/features/articles/components/MapPanel'
import { MoreMapsRow } from '@/features/articles/components/MoreMapsRow'
import type { MapsArticleTeaser } from '@/features/articles/lib/fetchMapsArticlesList'
import { useDevStore } from '@/lib/stores/devStore'

interface MapsArticleLayoutProps {
  article: MapsListicleArticle
  relatedArticles: MapsArticleTeaser[]
  country: string
  city: string
}

export function MapsArticleLayout({
  article,
  relatedArticles,
  country,
  city,
}: MapsArticleLayoutProps): JSX.Element {
  const { mapsEnabled } = useDevStore()

  return (
    <>
      <link rel="preconnect" href="https://www.instagram.com" />
      <link
        rel="preconnect"
        href="https://www.cdninstagram.com"
        crossOrigin="anonymous"
      />
      <link rel="dns-prefetch" href="https://platform.instagram.com" />
      <div
        data-article-layout="maps"
        className="1024:flex 1024:min-h-screen 1024:max-w-[1600px] 1024:mx-auto"
      >
        <div className="1024:w-2/5 1024:min-w-0 1024:pt-[25px]">
          <MapsListicleArticlePage article={article} />
        </div>
        {mapsEnabled && (
          <div
            className="hidden 1024:flex 1024:flex-col 1024:w-3/5 1024:sticky 1024:self-start"
            style={{
              top: "calc(var(--navbar-height, 6rem) + 15px + ((1 - var(--navbar-collapse, 0)) * 10px))",
              height:
                "calc(100vh - var(--navbar-height, 6rem) - 15px - ((1 - var(--navbar-collapse, 0)) * 10px))",
            }}
          >
            <div className="flex-1 min-h-0">
              <MapPanel />
            </div>
            <div aria-hidden="true" className="h-[140px] shrink-0 bg-background" />
            <MoreMapsRow
              articles={relatedArticles}
              country={country}
              city={city}
              currentSlug={article.slug}
            />
          </div>
        )}
      </div>
    </>
  )
}
