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
  const authorName = article.author?.name
  const fullName = [article.author?.firstName, article.author?.lastName].filter(Boolean).join(' ')
  return authorName || fullName || 'Questurian'
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

type SlotCardProps = {
  article: FeaturedArticleTeaser
}

/** Slots 1-2: left-column cards — wide 16/9 image, label, title, byline. */
function WideCard({ article }: SlotCardProps): JSX.Element {
  const mobileImageUrl = article.imageUrlSquare ?? article.imageUrl ?? null
  const desktopImageUrl = article.imageUrl ?? article.imageUrlSquare ?? null
  const hasImage = mobileImageUrl !== null || desktopImageUrl !== null
  const { imageRef, isContentReady, isImageLoaded, setImageStatus } =
    useArticleImageStatus(mobileImageUrl ?? desktopImageUrl)

  const articleTypeLabel = getArticleTypeLabel(article)
  const authorLabel = getAuthorLabel(article)
  const smallMobileTitleClass = getSmallMobileTitleClass(article.title)

  return (
    <section
      className="city-article-card city-article-card--nine-wide grid gap-3 px-[var(--block-gutter)] py-4"
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-article-image-shell relative aspect-square overflow-hidden bg-[#d7dcde] 768:aspect-[16/9]">
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
              fetchPriority="auto"
              loading="lazy"
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
            className={joinClassNames(
              'mt-2.5 font-editorial font-semibold text-[#1a1a1a]',
              smallMobileTitleClass,
            )}
          >
            {article.articlePath ? (
              <Link href={article.articlePath} className="hover:underline">{article.title}</Link>
            ) : article.title}
          </h2>

          <p className="mt-3 font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#5f5952]">
            <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} className="hover:underline">{authorLabel}</AuthorLink>
          </p>
        </div>

        <div
          aria-hidden="true"
          className="city-article-text-skeleton absolute inset-0 flex flex-col justify-start py-0"
        >
          <span className="city-skeleton-line h-4 w-full" />
          <span className="city-skeleton-line mt-2.5 h-4 w-full" />
          <span className="city-skeleton-line mt-2.5 h-4 w-2/3" />
        </div>
      </div>
    </section>
  )
}

/** Slot 3: center hero — 3/2 image, large title, excerpt, byline. */
function CenterHeroCard({ article }: SlotCardProps): JSX.Element {
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
      className="city-article-card city-article-card--nine-hero grid gap-3 px-[var(--block-gutter)] py-4"
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-article-image-shell relative aspect-square overflow-hidden bg-[#d7dcde] 768:aspect-[3/2]">
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
              fetchPriority="high"
              loading="eager"
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
            className={joinClassNames(
              'mt-2.5 font-editorial font-semibold text-[#1a1a1a]',
              smallMobileTitleClass,
            )}
          >
            {article.articlePath ? (
              <Link href={article.articlePath} className="hover:underline">{article.title}</Link>
            ) : article.title}
          </h2>

          <p className="mt-3 overflow-hidden font-editorial text-sm font-normal leading-[1.4] text-[#3f3a35] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {excerpt}
          </p>

          <p className="mt-3.5 font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#5f5952]">
            <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} className="hover:underline">{authorLabel}</AuthorLink>
          </p>
        </div>

        <div
          aria-hidden="true"
          className="city-article-text-skeleton absolute inset-0 flex flex-col justify-start py-0"
        >
          <span className="city-skeleton-line h-4 w-full" />
          <span className="city-skeleton-line mt-2.5 h-4 w-full" />
          <span className="city-skeleton-line mt-2.5 h-4 w-2/3" />
        </div>
      </div>
    </section>
  )
}

/** Slot 4: center horizontal card — copy left, 4/3 image right. */
function HorizontalCard({ article }: SlotCardProps): JSX.Element {
  const imageUrl = article.imageUrl ?? article.imageUrlSquare ?? null
  const { imageRef, isContentReady, isImageLoaded, setImageStatus } =
    useArticleImageStatus(imageUrl)

  const articleTypeLabel = getArticleTypeLabel(article)
  const authorLabel = getAuthorLabel(article)

  return (
    <section
      className="city-article-card city-nine-horiz-card px-[var(--block-gutter)] py-4"
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="relative">
        <div className="city-article-content flex w-full flex-col justify-start py-0">
          <p className="font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase leading-3 tracking-[0.1em] text-[#1e3599]">
            {articleTypeLabel}
          </p>

          <h2 className="mt-2 font-editorial text-[1.18rem] font-bold leading-[1.08] text-[#111111]">
            {article.articlePath ? (
              <Link href={article.articlePath} className="hover:underline">{article.title}</Link>
            ) : article.title}
          </h2>

          <p className="mt-2.5 font-[family-name:var(--font-dm-sans)] text-[0.6rem] font-bold uppercase tracking-[0.11em] leading-none text-[#5e5752]">
            <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} className="hover:underline">{authorLabel}</AuthorLink>
          </p>
        </div>

        <div
          aria-hidden="true"
          className="city-article-text-skeleton absolute inset-0 flex flex-col justify-start py-0"
        >
          <span className="city-skeleton-line h-3 w-full" />
          <span className="city-skeleton-line mt-2 h-3 w-full" />
          <span className="city-skeleton-line mt-2 h-3 w-2/3" />
        </div>
      </div>

      <div className="city-article-image-shell relative aspect-[4/3] overflow-hidden bg-[#d7dcde]">
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
    </section>
  )
}

/** Slots 5-9: right-column compact list rows — copy left, small square thumb right. */
function CompactListCard({ article }: SlotCardProps): JSX.Element {
  const imageUrl = article.imageUrlSquare ?? article.imageUrl ?? null
  const { imageRef, isContentReady, isImageLoaded, setImageStatus } =
    useArticleImageStatus(imageUrl)
  const excerpt = article.excerpt ?? 'Meta description not set'
  const authorLabel = getAuthorLabel(article)

  return (
    <section
      className="city-compact-article-card px-[var(--block-gutter)] py-4"
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-compact-article-copy">
        <h2 className="city-compact-article-title">
          {article.articlePath ? (
            <Link href={article.articlePath} className="hover:underline">{article.title}</Link>
          ) : article.title}
        </h2>
        <p className="city-compact-article-meta">{excerpt}</p>
        <p className="city-compact-article-author">
          By <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} className="hover:underline">{authorLabel}</AuthorLink>
        </p>
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
        <span className="city-skeleton-line h-3 w-full" />
        <span className="city-skeleton-line mt-2 h-3 w-full" />
        <span className="city-skeleton-line mt-2 h-3 w-2/3" />
      </div>
    </section>
  )
}

export function FeaturedArticlesNineArticlePreview({
  block,
}: HomepageBlockLayoutProps<FeaturedArticlesBlock>): JSX.Element | null {
  if (block.items.length === 0) return null

  const wideArticles = block.items.slice(0, 2)
  const heroArticle = block.items[2]
  const horizArticle = block.items[3]
  const listArticles = block.items.slice(4, 9)
  const sectionHeading = block.sectionHeading?.trim() || null
  const sectionSubheading = block.sectionSubheading?.trim() || null

  return (
    <section aria-label="Featured articles">
      {sectionHeading ? (
        <div className={`${BLOCK_MAX_WIDTH_CLASS} ${BLOCK_GUTTER_CLASS} pt-8 pb-0`}>
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

      <div className="city-featured-nine-layout">
        <div className="city-featured-nine-left">
          {wideArticles.map((article, index) => (
            <WideCard
              key={getArticleKey(article, index)}
              article={article}
            />
          ))}
        </div>

        <div className="city-featured-nine-center">
          {heroArticle ? (
            <CenterHeroCard
              key={getArticleKey(heroArticle, 2)}
              article={heroArticle}
            />
          ) : null}
          {horizArticle ? (
            <HorizontalCard
              key={getArticleKey(horizArticle, 3)}
              article={horizArticle}
            />
          ) : null}
        </div>

        <div className="city-featured-nine-right">
          {listArticles.map((article, index) => (
            <CompactListCard
              key={getArticleKey(article, index + 4)}
              article={article}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
