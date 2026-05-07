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
        style={{ marginTop: "calc((1 - var(--navbar-collapse, 0)) * 20px)" }}
      >
        <div className="1024:flex-1 1024:min-w-0 1024:border-r 1024:border-foreground/10">
          <MapsListicleArticlePage article={article} />
        </div>
        {mapsEnabled && (
          <div
            className="hidden 1024:flex 1024:flex-col 1024:flex-1 1024:sticky 1024:self-start"
            style={{
              top: "var(--navbar-height, 6rem)",
              height: "calc(100vh - var(--navbar-height, 6rem))",
            }}
          >
            <div className="flex-1 min-h-0">
              <MapPanel />
            </div>
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
