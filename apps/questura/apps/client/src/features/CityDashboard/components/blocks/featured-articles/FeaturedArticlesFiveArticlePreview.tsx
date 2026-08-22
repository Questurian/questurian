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
import { NavigableImageTarget } from '../NavigableImageTarget'

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

type MagazineHeroCardProps = {
  article: FeaturedArticleTeaser
}

/** Slot 1: magazine hero — square image over serif title, dek, byline. */
function MagazineHeroCard({ article }: MagazineHeroCardProps): JSX.Element {
  const imageUrl = article.imageUrlSquare ?? article.imageUrl ?? null
  const { imageRef, isContentReady, isImageLoaded, setImageStatus } =
    useArticleImageStatus(imageUrl)

  const articleTypeLabel = getArticleTypeLabel(article)
  const excerpt = article.excerpt ?? 'Meta description not set'
  const authorLabel = getAuthorLabel(article)
  const smallMobileTitleClass = getSmallMobileTitleClass(article.title)
  const articlePath = article.articlePath ?? null

  return (
    <section
      className="city-article-card city-five-hero-card"
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-article-image-shell city-five-hero-image relative aspect-square overflow-hidden bg-[#d7dcde]">
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
        <NavigableImageTarget href={articlePath} label={`Read ${article.title}`} />
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
            {articlePath ? (
              <Link href={articlePath} className="hover:underline">
                {article.title}
              </Link>
            ) : (
              article.title
            )}
          </h2>

          <p
            data-article-dek
            className="mt-3 overflow-hidden font-editorial text-sm font-normal leading-[1.4] text-[#3f3a35] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
          >
            {articlePath ? <Link href={articlePath}>{excerpt}</Link> : excerpt}
          </p>

          <p className="mt-3.5 font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#5f5952]">
            <AuthorLink
              authorSlug={article.author?.slug}
              authorId={article.author?.id}
              className="hover:underline"
            >
              {authorLabel}
            </AuthorLink>
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

type SidebarMediaCardProps = {
  article: FeaturedArticleTeaser
}

/** Slot 2: sidebar media row — square thumb with label, title, byline. */
function SidebarMediaCard({ article }: SidebarMediaCardProps): JSX.Element {
  const imageUrl = article.imageUrlSquare ?? article.imageUrl ?? null
  const { imageRef, isContentReady, isImageLoaded, setImageStatus } =
    useArticleImageStatus(imageUrl)

  const articleTypeLabel = getArticleTypeLabel(article)
  const authorLabel = getAuthorLabel(article)
  const articlePath = article.articlePath ?? null

  return (
    <section
      className="city-five-side-media"
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="city-article-image-shell city-five-side-thumb">
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
        <NavigableImageTarget href={articlePath} label={`Read ${article.title}`} />
      </div>

      <div className="city-five-side-copy">
        <p className="city-five-side-type">{articleTypeLabel}</p>
        <h3 className="city-five-side-title">
          {articlePath ? (
            <Link href={articlePath} className="hover:underline">
              {article.title}
            </Link>
          ) : (
            article.title
          )}
        </h3>
        <p className="city-five-side-author">
          <AuthorLink
            authorSlug={article.author?.slug}
            authorId={article.author?.id}
            className="hover:underline"
          >
            {authorLabel}
          </AuthorLink>
        </p>
      </div>
    </section>
  )
}

type SidebarTextRowProps = {
  article: FeaturedArticleTeaser
}

/** Slots 3-5: text-only sidebar rows. */
function SidebarTextRow({ article }: SidebarTextRowProps): JSX.Element {
  const articleTypeLabel = getArticleTypeLabel(article)
  const excerpt = article.excerpt ?? 'Meta description not set'
  const authorLabel = getAuthorLabel(article)
  const articlePath = article.articlePath ?? null

  return (
    <section className="city-five-side-text">
      <p className="city-five-side-type">{articleTypeLabel}</p>
      <h3 className="city-five-side-title">
        {articlePath ? (
          <Link href={articlePath} className="hover:underline">
            {article.title}
          </Link>
        ) : (
          article.title
        )}
      </h3>
      <p data-article-dek className="city-five-side-dek">
        {articlePath ? <Link href={articlePath}>{excerpt}</Link> : excerpt}
      </p>
      <p className="city-five-side-author">
        <AuthorLink
          authorSlug={article.author?.slug}
          authorId={article.author?.id}
          className="hover:underline"
        >
          {authorLabel}
        </AuthorLink>
      </p>
    </section>
  )
}

export function FeaturedArticlesFiveArticlePreview({
  block,
}: HomepageBlockLayoutProps<FeaturedArticlesBlock>): JSX.Element | null {
  if (block.items.length === 0) return null

  const heroArticle = block.items[0]
  const mediaArticle = block.items[1] ?? null
  const textArticles = block.items.slice(2, 5)
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

      <div className="city-featured-five-layout">
        <div className="city-featured-five-hero">
          {heroArticle ? (
            <MagazineHeroCard key={getArticleKey(heroArticle, 0)} article={heroArticle} />
          ) : null}
        </div>

        <div className="city-featured-five-sidebar">
          {mediaArticle ? (
            <SidebarMediaCard key={getArticleKey(mediaArticle, 1)} article={mediaArticle} />
          ) : null}
          {textArticles.map((article, index) => (
            <SidebarTextRow key={getArticleKey(article, index + 2)} article={article} />
          ))}
        </div>
      </div>
    </section>
  )
}
