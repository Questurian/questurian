'use client'

import type { CSSProperties, JSX } from 'react'
import { MapPanel } from '@/features/articles/components/MapPanel'
import { RelatedListicleShelf } from '@/features/articles/components/RelatedListicleShelf'
import type { RelatedMapsArticleTeaser } from '@/features/articles/lib/fetchRelatedMapsArticles'
import { useDevStore } from '@/lib/stores/devStore'

interface ListicleArticleLayoutProps {
  children: JSX.Element
  relatedArticles: RelatedMapsArticleTeaser[]
  country: string
  city?: string | null
}

const listicleLayoutStyle = {
  '--maps-card-inset': '32px',
  '--maps-map-gutter': '24px',
  '--maps-divider-color': 'rgb(26 26 26 / 0.28)',
  '--maps-divider-offset': '-4.5px',
} as CSSProperties

export function ListicleArticleLayout({
  children,
  relatedArticles,
  country,
  city,
}: ListicleArticleLayoutProps): JSX.Element {
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
      {/* Warm the embed.js download in parallel with hydration; the runtime
          loader in InstagramEmbedBlock then hits the HTTP cache. */}
      <link
        rel="preload"
        href="https://www.instagram.com/embed.js"
        as="script"
      />
      <div
        data-article-layout="listicle"
        className="relative 1024:flex 1024:min-h-screen 1024:max-w-[1600px] 1024:mx-auto"
        style={listicleLayoutStyle}
      >
        <div className="maps-article-column 1024:min-w-0 1024:pt-[25px]">
          {children}
        </div>
        {mapsEnabled && (
          <div
            aria-hidden="true"
            className="maps-map-divider hidden 1024:block 1024:absolute 1024:top-[25px] 1024:bottom-0 1024:w-px 1024:pointer-events-none"
          />
        )}
        {mapsEnabled && (
          <div
            className="maps-map-column hidden 1024:flex 1024:flex-col 1024:sticky 1024:self-start"
          >
            <div className="flex-1 min-h-0">
              <MapPanel />
            </div>
            <RelatedListicleShelf
              articles={relatedArticles}
              country={country}
              city={city}
            />
          </div>
        )}
      </div>
    </>
  )
}
