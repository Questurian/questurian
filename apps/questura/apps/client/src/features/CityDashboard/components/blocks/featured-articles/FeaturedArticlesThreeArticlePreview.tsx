'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type JSX } from 'react'

import type {
  FeaturedArticleTeaser,
  FeaturedArticlesBlock,
  HomepageBlockLayoutProps,
} from '../../../types'
import { BLOCK_GUTTER_CLASS, BLOCK_MAX_WIDTH_CLASS } from '../BlockSection'
import { AuthorLink } from '@/features/authors/components/AuthorLink'

function joinClassNames(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

function getArticleTypeLabel(article: FeaturedArticleTeaser): string {
  return article.articleType ?? article.category?.name ?? 'Article'
}

function getAuthorLabel(article: FeaturedArticleTeaser): string {
  return article.author?.name || 'Questurian'
}

function getSmallMobileTitleClass(title: string): string {
  const characterCount = title.trim().length
  if (characterCount <= 28) return 'text-[2rem] leading-[0.92]'
  if (characterCount <= 44) return 'text-[1.72rem] leading-[0.94]'
  if (characterCount <= 64) return 'text-[1.55rem] leading-[0.98]'
  return 'text-[1.38rem] leading-[1.02]'
}

function getArticleKey(article: FeaturedArticleTeaser, index: number): string {
  return [article.title, article.imageUrlSquare ?? article.imageUrl ?? index].join(':')
}

function getBlockSectionHeading(items: FeaturedArticleTeaser[]): string | null {
  const type = items[0]?.articleType
  if (!type) return null
  if (type.endsWith('y')) return type.slice(0, -1) + 'ies'
  if (type.endsWith('s')) return type
  return type + 's'
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
    if (!imageUrl || !image) return
    if (image.complete && image.naturalWidth > 0) {
      setImageStatus('loaded')
    }
  }, [imageUrl])

  return { imageRef, isContentReady, isImageLoaded, setImageStatus }
}

function ArticleTitleLink({ article }: { article: FeaturedArticleTeaser }): JSX.Element {
  return article.articlePath ? (
    <Link href={article.articlePath} className="hover:underline">
      {article.title}
    </Link>
  ) : (
    <>{article.title}</>
  )
}

type HeroArticleCardProps = {
  article: FeaturedArticleTeaser
}

// Slot 1 in the hero-left layout: large image over copy, mirrors the four-slot hero.
function HeroArticleCard({ article }: HeroArticleCardProps): JSX.Element {
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
      className="city-article-card city-three-hero-card"
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-article-image-shell city-three-hero-image relative aspect-square overflow-hidden bg-[#d7dcde]">
        {hasImage ? (
          <picture className="block h-full w-full">
            {desktopImageUrl ? (
              <source media="(min-width: 1024px)" srcSet={desktopImageUrl} />
            ) : null}
            <img
              ref={imageRef}
              src={mobileImageUrl ?? desktopImageUrl ?? undefined}
              alt=""
              className={`relative z-10 h-full w-full object-cover transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
              decoding="async"
              fetchPriority="high"
              loading="eager"
              onError={() => setImageStatus('failed')}
              onLoad={() => setImageStatus('loaded')}
            />
          </picture>
        ) : null}
      </div>

      <div className="relative px-[var(--block-gutter)]">
        <div className="city-article-content flex w-full flex-col justify-start py-3">
          <p className="font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase leading-3 tracking-[0.08em] text-[#1e3599] 768:text-[0.74rem] 768:leading-4 768:tracking-[0.1em]">
            {articleTypeLabel}
          </p>

          <h2
            className={joinClassNames(
              'mt-2.5 font-editorial font-semibold text-[#1a1a1a]',
              smallMobileTitleClass,
            )}
          >
            <ArticleTitleLink article={article} />
          </h2>

          <p data-article-dek className="mt-3 overflow-hidden font-editorial text-sm font-normal leading-[1.4] text-[#3f3a35] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
            {article.articlePath ? <Link href={article.articlePath}>{excerpt}</Link> : excerpt}
          </p>

          <p className="mt-3.5 font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#5f5952]">
            <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} className="hover:underline">{authorLabel}</AuthorLink>
          </p>
        </div>

        <div
          aria-hidden="true"
          className="city-article-text-skeleton absolute inset-0 flex flex-col justify-start px-[var(--block-gutter)] py-3"
        >
          <span className="city-skeleton-line h-4 w-full" />
          <span className="city-skeleton-line mt-2.5 h-4 w-full" />
          <span className="city-skeleton-line mt-2.5 h-4 w-2/3" />
        </div>
      </div>
    </section>
  )
}

type StackedWideCardProps = {
  article: FeaturedArticleTeaser
  variant?: 'stack' | 'fc-side'
}

// Wide-image card: right-column stack in hero-left, side columns in featured-center.
function StackedWideCard({
  article,
  variant = 'stack',
}: StackedWideCardProps): JSX.Element {
  const imageUrl = article.imageUrl ?? article.imageUrlSquare ?? null
  const { imageRef, isContentReady, isImageLoaded, setImageStatus } =
    useArticleImageStatus(imageUrl)

  const articleTypeLabel = getArticleTypeLabel(article)
  const authorLabel = getAuthorLabel(article)

  return (
    <section
      className={joinClassNames(
        'city-three-stack-card',
        variant === 'fc-side' && 'city-three-fc-side-card',
      )}
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-article-image-shell city-three-stack-image">
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

      <div className="city-three-stack-copy">
        <p className="city-three-stack-type">{articleTypeLabel}</p>
        <h3 className="city-three-stack-title">
          <ArticleTitleLink article={article} />
        </h3>
        <p className="city-three-stack-author">
          <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} className="hover:underline">{authorLabel}</AuthorLink>
        </p>
      </div>
    </section>
  )
}

type CenterFeatureCardProps = {
  article: FeaturedArticleTeaser
}

// Slot 2 in the featured-center layout: tall center feature.
function CenterFeatureCard({ article }: CenterFeatureCardProps): JSX.Element {
  const mobileImageUrl = article.imageUrlSquare ?? article.imageUrl ?? null
  const desktopImageUrl = article.imageUrl ?? article.imageUrlSquare ?? null
  const hasImage = mobileImageUrl !== null || desktopImageUrl !== null
  const { imageRef, isContentReady, isImageLoaded, setImageStatus } =
    useArticleImageStatus(mobileImageUrl ?? desktopImageUrl)

  const articleTypeLabel = getArticleTypeLabel(article)
  const excerpt = article.excerpt ?? 'Meta description not set'
  const authorLabel = getAuthorLabel(article)

  return (
    <section
      className="city-three-stack-card city-three-fc-center-card"
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-article-image-shell city-three-stack-image city-three-fc-center-image">
        {hasImage ? (
          <picture className="block h-full w-full">
            {desktopImageUrl ? (
              <source media="(min-width: 1024px)" srcSet={desktopImageUrl} />
            ) : null}
            <img
              ref={imageRef}
              src={mobileImageUrl ?? desktopImageUrl ?? undefined}
              alt=""
              className={`relative z-10 h-full w-full object-cover transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
              decoding="async"
              fetchPriority="high"
              loading="eager"
              onError={() => setImageStatus('failed')}
              onLoad={() => setImageStatus('loaded')}
            />
          </picture>
        ) : null}
      </div>

      <div className="city-three-stack-copy">
        <p className="city-three-stack-type">{articleTypeLabel}</p>
        <h3 className="city-three-stack-title city-three-fc-center-title">
          <ArticleTitleLink article={article} />
        </h3>
        <p data-article-dek className="city-three-fc-center-meta">{article.articlePath ? <Link href={article.articlePath}>{excerpt}</Link> : excerpt}</p>
        <p className="city-three-stack-author">
          <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} className="hover:underline">{authorLabel}</AuthorLink>
        </p>
      </div>
    </section>
  )
}

export function FeaturedArticlesThreeArticlePreview({
  block,
}: HomepageBlockLayoutProps<FeaturedArticlesBlock>): JSX.Element | null {
  if (block.items.length === 0) return null

  const layout = block.slot3Layout === 'featured-center' ? 'featured-center' : 'hero-left'
  const articles = block.items.slice(0, 3)
  const sectionHeading = block.sectionHeading?.trim() || getBlockSectionHeading(block.items)
  const sectionSubheading = block.sectionSubheading?.trim() || null

  return (
    <section className="bg-[#f5f0e8]" aria-label="Featured articles">
      {sectionHeading ? (
        <div className={`${BLOCK_MAX_WIDTH_CLASS} ${BLOCK_GUTTER_CLASS} pt-8 pb-4`}>
          <h2 className="font-editorial font-semibold leading-tight text-[#1a1a1a] text-[1.4rem] 768:text-[1.7rem] 1024:text-[2rem] 1280:text-[2.3rem]">
            {sectionHeading}
          </h2>
          {sectionSubheading ? (
            <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.75rem] 768:text-[0.85rem] 1024:text-[0.9rem] text-[#3f3a35] leading-relaxed">
              {sectionSubheading}
            </p>
          ) : null}
        </div>
      ) : null}

      {layout === 'featured-center' ? (
        <div className="city-featured-three-fc-layout">
          {articles.map((article, index) =>
            index === 1 ? (
              <CenterFeatureCard
                key={getArticleKey(article, index)}
                article={article}
              />
            ) : (
              <StackedWideCard
                key={getArticleKey(article, index)}
                article={article}
                variant="fc-side"
              />
            ),
          )}
        </div>
      ) : (
        <div className="city-featured-three-layout">
          <div className="city-featured-three-hero">
            <HeroArticleCard
              key={getArticleKey(articles[0], 0)}
              article={articles[0]}
            />
          </div>

          <div className="city-featured-three-stack">
            {articles.slice(1, 3).map((article, index) => (
              <StackedWideCard
                key={getArticleKey(article, index + 1)}
                article={article}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
