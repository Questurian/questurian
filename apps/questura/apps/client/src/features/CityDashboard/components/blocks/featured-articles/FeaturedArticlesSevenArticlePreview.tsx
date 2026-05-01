'use client'

import { useEffect, useRef, useState, type JSX } from 'react'

import type {
  FeaturedArticleTeaser,
  FeaturedArticlesBlock,
  HomepageBlockLayoutProps,
} from '../../../types'

const PREVIEW_ARTICLE_COUNT = 3

type FeaturedArticlePlacement = 'center' | 'left'
type CompactArticlePlacement = 'right'

function joinClassNames(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

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

function useArticleImageStatus(imageUrl: string | null) {
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

  return { imageRef, isContentReady, isImageLoaded, setImageStatus }
}

type FeaturedArticlePreviewCardProps = {
  article: FeaturedArticleTeaser
  isPriority: boolean
  placement?: FeaturedArticlePlacement
}

function FeaturedArticlePreviewCard({
  article,
  isPriority,
  placement,
}: FeaturedArticlePreviewCardProps): JSX.Element {
  const mobileImageUrl = article.imageUrlSquare ?? article.imageUrl ?? null
  const desktopImageUrl = article.imageUrl ?? article.imageUrlSquare ?? null
  const hasImage = mobileImageUrl !== null || desktopImageUrl !== null
  const { imageRef, isContentReady, isImageLoaded, setImageStatus } =
    useArticleImageStatus(mobileImageUrl ?? desktopImageUrl)

  const articleTypeLabel = getArticleTypeLabel(article)
  const excerpt = article.excerpt ?? 'Meta description not set'
  const authorLabel = getAuthorLabel(article)
  const smallMobileTitleClass = getSmallMobileTitleClass(article.title)

  return (
    <section
      className={joinClassNames(
        'city-article-card grid gap-3 px-6 py-4 768:px-[30px]',
        placement ? `city-article-card--${placement}` : null,
      )}
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-article-image-shell relative aspect-square overflow-hidden bg-[#d7dcde] 768:aspect-[1200/630]">
        {hasImage ? (
          <picture className="block h-full w-full">
            {desktopImageUrl ? (
              <source media="(min-width: 768px)" srcSet={desktopImageUrl} />
            ) : null}
            <img
              ref={imageRef}
              src={mobileImageUrl ?? desktopImageUrl ?? undefined}
              alt=""
              className={`relative z-10 h-full w-full object-cover transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
              decoding="async"
              fetchPriority={isPriority ? 'high' : 'auto'}
              loading={isPriority ? 'eager' : 'lazy'}
              onError={() => setImageStatus('failed')}
              onLoad={() => setImageStatus('loaded')}
            />
          </picture>
        ) : null}
      </div>

      <div className="relative">
        <div className="city-article-content flex w-full flex-col justify-start py-0">
          <p className="font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase leading-3 tracking-[0.08em] text-[#1e3599] 768:text-[0.74rem] 768:leading-4 768:tracking-[0.1em]">
            {articleTypeLabel}
          </p>

          <h2
            className={`mt-2.5 max-w-2xl font-editorial font-semibold text-[#1a1a1a] 768:max-w-none 768:text-[2.1rem] 768:leading-[1] ${smallMobileTitleClass}`}
          >
            {article.title}
          </h2>

          <p className="mt-3 max-w-xl overflow-hidden font-editorial text-sm font-normal leading-[1.4] text-[#3f3a35] 768:max-w-none 768:text-[1.04rem] 768:leading-[1.5] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] 768:[-webkit-line-clamp:3]">
            {excerpt}
          </p>

          <p className="mt-3.5 font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#5f5952] 768:mt-4 768:text-[0.72rem] 768:tracking-[0.1em]">
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

type CompactArticlePreviewCardProps = {
  article: FeaturedArticleTeaser
  placement?: CompactArticlePlacement
}

function CompactArticlePreviewCard({
  article,
  placement,
}: CompactArticlePreviewCardProps): JSX.Element {
  const imageUrl = article.imageUrlSquare ?? article.imageUrl ?? null
  const { imageRef, isContentReady, isImageLoaded, setImageStatus } =
    useArticleImageStatus(imageUrl)
  const excerpt = article.excerpt ?? 'Meta description not set'
  const authorLabel = getAuthorLabel(article)

  return (
    <section
      className={joinClassNames(
        'city-compact-article-card px-6 py-4',
        placement ? `city-compact-article-card--${placement}` : null,
      )}
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-compact-article-copy">
        <h2 className="city-compact-article-title">{article.title}</h2>
        <p className="city-compact-article-meta">{excerpt}</p>
        <p className="city-compact-article-author">By {authorLabel}</p>
      </div>

      <div className="city-article-image-shell city-compact-article-image">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            src={imageUrl}
            alt=""
            className={`relative z-10 h-full w-full object-cover transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
            decoding="async"
            fetchPriority="auto"
            loading="lazy"
            onError={() => setImageStatus('failed')}
            onLoad={() => setImageStatus('loaded')}
          />
        ) : null}
      </div>

      <div aria-hidden="true" className="city-compact-article-skeleton">
        <span className="city-skeleton-line h-4 w-full" />
        <span className="city-skeleton-line mt-1.5 h-4 w-10/12" />
        <span className="city-skeleton-line mt-3 h-3 w-full" />
        <span className="city-skeleton-line mt-1.5 h-3 w-4/5" />
        <span className="city-skeleton-line mt-4 h-3 w-24" />
      </div>
    </section>
  )
}

function getArticleKey(article: FeaturedArticleTeaser, index: number): string {
  return [article.title, article.imageUrlSquare ?? article.imageUrl ?? index].join(':')
}

function RecommendedDivider(): JSX.Element {
  return (
    <div className="city-recommended-divider px-6" aria-label="Recommended articles">
      <span className="city-recommended-divider__label">Recommended</span>
    </div>
  )
}

export function FeaturedArticlesSevenArticlePreview({
  block,
}: HomepageBlockLayoutProps<FeaturedArticlesBlock>): JSX.Element | null {
  const previewArticles = block.items.slice(0, PREVIEW_ARTICLE_COUNT)
  const compactArticles = block.items.slice(PREVIEW_ARTICLE_COUNT)
  const centerArticle = block.items[0]
  const leftArticles = block.items.slice(1, 3)
  const rightArticles = block.items.slice(3, 7)

  if (previewArticles.length === 0 && compactArticles.length === 0) {
    return null
  }

  return (
    <section className="city-featured-seven-layout" aria-label="Featured articles">
      <div className="city-featured-seven-center">
        {centerArticle ? (
          <FeaturedArticlePreviewCard
            article={centerArticle}
            isPriority
            key={getArticleKey(centerArticle, 0)}
            placement="center"
          />
        ) : null}
      </div>

      <div className="city-featured-seven-left">
        {leftArticles.map((article, index) => {
          const articleIndex = index + 1

          return (
            <FeaturedArticlePreviewCard
              article={article}
              isPriority={false}
              key={getArticleKey(article, articleIndex)}
              placement="left"
            />
          )
        })}
      </div>

      <div className="city-featured-seven-right">
        {rightArticles.length > 0 ? <RecommendedDivider /> : null}
        {rightArticles.map((article, index) => {
          const articleIndex = index + PREVIEW_ARTICLE_COUNT

          return (
            <CompactArticlePreviewCard
              article={article}
              key={getArticleKey(article, articleIndex)}
              placement="right"
            />
          )
        })}
      </div>
    </section>
  )
}
