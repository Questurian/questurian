'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type JSX } from 'react'

import type {
  CityHomepageArticleBlock,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from '../../../types'
import { BLOCK_GUTTER_CLASS, BlockSection, CAROUSEL_CARD_WIDTH_CLASS } from '../BlockSection'
import { useSnapCarousel } from '../useSnapCarousel'
import { AuthorLink } from '@/features/authors/components/AuthorLink'
import { NavigableImageTarget } from '../NavigableImageTarget'

function getArticleTypeLabel(article: FeaturedArticleTeaser): string {
  return article.articleType ?? article.category?.name ?? 'Article'
}

function getAuthorLabel(article: FeaturedArticleTeaser): string {
  return article.author?.name || 'Questurian'
}

function getArticleKey(article: FeaturedArticleTeaser, index: number): string {
  return [article.title, article.imageUrlSquare ?? article.imageUrl ?? index].join(':')
}

type CarouselArticleCardProps = {
  article: FeaturedArticleTeaser
  isPriority: boolean
  isLast: boolean
}

function CarouselArticleCard({ article, isPriority, isLast }: CarouselArticleCardProps): JSX.Element {
  const imageUrl = article.imageUrl ?? article.imageUrlSquare ?? null
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'failed'>(
    imageUrl ? 'loading' : 'failed',
  )

  // The image is server-rendered at opacity-0 and faded in via onLoad. If it
  // finishes loading (e.g. from cache) before hydration attaches the handler,
  // the load event is missed and the card stays blank. Reconcile on mount.
  useEffect(() => {
    setImageStatus(imageUrl ? 'loading' : 'failed')
    const image = imageRef.current
    if (!imageUrl || !image) return
    if (image.complete && image.naturalWidth > 0) {
      setImageStatus('loaded')
    }
  }, [imageUrl])

  const isImageLoaded = imageStatus === 'loaded'
  const articleTypeLabel = getArticleTypeLabel(article)
  const excerpt = article.excerpt ?? null
  const authorLabel = getAuthorLabel(article)
  const articlePath = article.articlePath ?? null

  const inner = (
    <>
      <div className="relative aspect-[3/2] overflow-hidden bg-[#d7dcde]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            src={imageUrl}
            alt=""
            className={`h-full w-full object-cover transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
            decoding="async"
            fetchPriority={isPriority ? 'high' : 'auto'}
            loading={isPriority ? 'eager' : 'lazy'}
            onError={() => setImageStatus('failed')}
            onLoad={() => setImageStatus('loaded')}
          />
        ) : null}
        <NavigableImageTarget href={articlePath} label={`Read ${article.title}`} />
      </div>

      <div className="pt-4 flex flex-col flex-1">
        <p className="font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase leading-none tracking-[0.12em] text-[#1e3599] 768:text-[0.67rem]">
          {articleTypeLabel}
        </p>

        <h3 className="mt-2 font-editorial text-[1.35rem] font-semibold leading-[1.1] text-[#1a1a1a]">
          {articlePath ? <Link href={articlePath}>{article.title}</Link> : article.title}
        </h3>

        {excerpt ? (
          <p data-article-dek className="mt-2 overflow-hidden font-editorial text-[0.88rem] font-normal leading-[1.5] text-[#3f3a35] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
            {articlePath ? <Link href={articlePath}>{excerpt}</Link> : excerpt}
          </p>
        ) : null}

        <p className="mt-auto pt-3 font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[#5f5952] 768:text-[0.65rem]">
          By <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} className="hover:underline">{authorLabel}</AuthorLink>
        </p>
      </div>
    </>
  )

  const cardClass = `flex-none snap-always flex flex-col ${CAROUSEL_CARD_WIDTH_CLASS} ${isLast ? 'snap-end' : 'snap-start'}`

  return <article className={cardClass}>{inner}</article>
}

export function FeaturedArticleCarouselPreview({
  block,
}: HomepageBlockLayoutProps<CityHomepageArticleBlock>): JSX.Element | null {
  const items = block.items ?? []

  const { scrollRef, pageCount, activePage, scrollToPage, scrollByPage } = useSnapCarousel(items.length)

  const heading = block.sectionHeading?.trim() || null
  const subheading = block.sectionSubheading?.trim() || null

  // Pages are measured after mount; until then fall back to one page per item
  // so the server-rendered controls match the multi-item case.
  const dotCount = pageCount > 0 ? pageCount : items.length
  const canScrollNext = pageCount > 0 ? activePage < pageCount - 1 : items.length > 1

  if (items.length === 0) return null

  return (
    // Flush BlockSection: the carousel bleeds to the wrapper edge, so the
    // gutter is applied per inner element via BLOCK_GUTTER_CLASS instead.
    <BlockSection className="py-8 bg-[#f5f0e8]" flush aria-label="Featured article carousel">
      {/* Header */}
      <div className={`flex items-center justify-between gap-3 ${BLOCK_GUTTER_CLASS} mb-5`}>
        <div className="flex-1 min-w-0">
          {heading ? (
            <h2 className="font-editorial font-semibold leading-tight text-[#1a1a1a] text-[1.4rem] 768:text-[1.7rem] 1024:text-[2rem] 1280:text-[2.3rem]">
              {heading}
            </h2>
          ) : null}
          {subheading ? (
            <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.75rem] 768:text-[0.85rem] 1024:text-[0.9rem] text-[#3f3a35] leading-relaxed">
              {subheading}
            </p>
          ) : null}
        </div>

        {items.length > 1 ? (
          <div className="flex items-center gap-1 768:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              disabled={activePage === 0}
              aria-label="Previous articles"
              className="
                flex items-center justify-center transition-colors
                w-9 h-9 text-[1.5rem] text-[#1a1a1a] disabled:text-[#c8c2b8]
                768:w-10 768:h-10 768:bg-[#1a1a1a] 768:text-white 768:text-[1.3rem]
                768:hover:bg-[#2c2c2c] 768:disabled:bg-[#d4cfc8] 768:disabled:text-[#a09890]
                1024:w-12 1024:h-12 1024:text-[1.6rem]
              "
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              disabled={!canScrollNext}
              aria-label="Next articles"
              className="
                flex items-center justify-center transition-colors
                w-9 h-9 text-[1.5rem] text-[#1a1a1a] disabled:text-[#c8c2b8]
                768:w-10 768:h-10 768:bg-[#1a1a1a] 768:text-white 768:text-[1.3rem]
                768:hover:bg-[#2c2c2c] 768:disabled:bg-[#d4cfc8] 768:disabled:text-[#a09890]
                1024:w-12 1024:h-12 1024:text-[1.6rem]
              "
            >
              ›
            </button>
          </div>
        ) : null}
      </div>

      {/* Carousel */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pl-[var(--block-gutter)]"
          style={{ scrollSnapType: 'x mandatory', scrollPaddingLeft: 'var(--block-gutter)', scrollPaddingRight: 'var(--block-gutter)', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {items.map((article, index) => (
            <CarouselArticleCard
              key={getArticleKey(article, index)}
              article={article}
              isPriority={index === 0}
              isLast={index === items.length - 1}
            />
          ))}
          <div className="w-[var(--block-gutter)] shrink-0" aria-hidden="true" />
        </div>
        {/* Masks the scrolled-past card tails that sit inside the gutter. Card
            images are `relative z-10`, so this has to be above them. */}
        <div className="absolute inset-y-0 left-0 z-20 w-[var(--block-gutter)] bg-[#f5f0e8] pointer-events-none" aria-hidden="true" />
      </div>

      {/* Dot indicators — one per scroll page, not per item */}
      {dotCount > 1 ? (
        <div className="flex justify-center gap-2.5 mt-6">
          {Array.from({ length: dotCount }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => scrollToPage(index)}
              aria-label={`Go to slide ${index + 1}`}
              className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                index === activePage ? 'bg-[#1a1a1a]' : 'bg-[#c8c2b8]'
              }`}
            />
          ))}
        </div>
      ) : null}
    </BlockSection>
  )
}
