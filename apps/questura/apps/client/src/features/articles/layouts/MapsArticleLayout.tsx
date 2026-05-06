import type { JSX } from 'react'
import { MapsListicleArticlePage } from '@/features/articles/MapsListicleArticlePage'
import type { MapsListicleArticle } from '@/features/articles/types/mapsListicle'

export function MapsArticleLayout({
  article,
}: {
  article: MapsListicleArticle
}): JSX.Element {
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
        <div className="1024:flex-1 1024:min-w-0 1024:border-r 1024:border-foreground/10">
          <MapsListicleArticlePage article={article} />
        </div>
        <div className="hidden 1024:block 1024:flex-1" aria-hidden="true" />
      </div>
    </>
  )
}
