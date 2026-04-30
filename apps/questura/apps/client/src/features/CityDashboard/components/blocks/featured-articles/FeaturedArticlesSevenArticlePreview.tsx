'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import type {
  FeaturedArticleTeaser,
  FeaturedArticlesBlock,
  HomepageBlockLayoutProps,
} from '../../../types'

function getArticleTypeLabel(article: FeaturedArticleTeaser): string {
  return article.articleType ?? article.category?.name ?? 'Article'
}

function getAuthorLabel(article: FeaturedArticleTeaser): string {
  const authorName = article.author?.name
  const fullName = [article.author?.firstName, article.author?.lastName].filter(Boolean).join(' ')

  return authorName || fullName || 'Questurian'
}

function getSmallMobileTitleClass(title: string): string {
  const characterCount = title.trim().length

  if (characterCount <= 28) {
    return 'text-[2rem] leading-[0.92]'
  }

  if (characterCount <= 44) {
    return 'text-[1.72rem] leading-[0.94]'
  }

  if (characterCount <= 64) {
    return 'text-[1.55rem] leading-[0.98]'
  }

  return 'text-[1.38rem] leading-[1.02]'
}

export function FeaturedArticlesSevenArticlePreview({
  block,
}: HomepageBlockLayoutProps<FeaturedArticlesBlock>): ReactNode {
  const article = block.items[0]
  const imageUrl = article?.imageUrlSquare ?? article?.imageUrl ?? null
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'failed'>(
    imageUrl ? 'loading' : 'failed',
  )
  const isImageLoaded = !imageUrl || imageStatus === 'loaded'
  const isContentReady = !imageUrl || imageStatus !== 'loading'

  useEffect(() => {
    const image = imageRef.current

    setImageStatus(imageUrl ? 'loading' : 'failed')

    if (!imageUrl || !image) {
      return
    }

    if (image.complete && image.naturalWidth > 0) {
      setImageStatus('loaded')
    }
  }, [imageUrl])

  if (!article) {
    return null
  }

  const articleTypeLabel = getArticleTypeLabel(article)
  const excerpt = article.excerpt ?? 'Meta description not set'
  const authorLabel = getAuthorLabel(article)
  const smallMobileTitleClass = getSmallMobileTitleClass(article.title)

  return (
    <section
      className="city-article-card grid gap-3 px-6 py-4"
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-article-image-shell relative aspect-square overflow-hidden bg-[#d7dcde]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            src={imageUrl}
            alt=""
            className={`relative z-10 h-full w-full object-cover transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
            decoding="async"
            fetchPriority="high"
            loading="eager"
            onError={() => setImageStatus('failed')}
            onLoad={() => setImageStatus('loaded')}
          />
        ) : null}
      </div>

      <div className="relative">
        <div className="city-article-content flex flex-col justify-start py-0">
          <p className="font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase leading-3 tracking-[0.08em] text-[#1e3599]">
            {articleTypeLabel}
          </p>

          <h2
            className={`mt-2.5 max-w-2xl font-editorial font-semibold text-[#1a1a1a] ${smallMobileTitleClass}`}
          >
            {article.title}
          </h2>

          <p className="mt-3 max-w-xl overflow-hidden font-editorial text-sm font-normal leading-[1.4] text-[#3f3a35] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {excerpt}
          </p>

          <p className="mt-3.5 font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#5f5952]">
            {authorLabel}
          </p>
        </div>

        <div
          aria-hidden="true"
          className="city-article-text-skeleton absolute inset-0 flex flex-col justify-start py-0"
        >
          <span className="city-skeleton-line h-3 w-32" />
          <span className="city-skeleton-line mt-3 h-7 w-11/12" />
          <span className="city-skeleton-line mt-2 h-7 w-4/5" />
          <span className="city-skeleton-line mt-2 h-7 w-2/3" />
          <span className="city-skeleton-line mt-4 h-4 w-full" />
          <span className="city-skeleton-line mt-2 h-4 w-5/6" />
          <span className="city-skeleton-line mt-4 h-3 w-28" />
        </div>
      </div>
    </section>
  )
}
