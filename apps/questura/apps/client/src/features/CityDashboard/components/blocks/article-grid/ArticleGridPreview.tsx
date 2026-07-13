'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type JSX } from 'react'

import type {
  ArticleGridBlock,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from '../../../types'
import { BlockSection } from '../BlockSection'
import { AuthorLink } from '@/features/authors/components/AuthorLink'

function getArticleTypeLabel(article: FeaturedArticleTeaser): string {
  return article.articleType ?? article.category?.name ?? 'Article'
}

function getAuthorLabel(article: FeaturedArticleTeaser): string {
  const name = article.author?.name
  const fullName = [article.author?.firstName, article.author?.lastName].filter(Boolean).join(' ')
  return name || fullName || 'Questurian'
}

function getArticleKey(article: FeaturedArticleTeaser, index: number): string {
  return [article.title, article.imageUrlSquare ?? article.imageUrl ?? index].join(':')
}

type GridArticleCardProps = {
  article: FeaturedArticleTeaser
  isPriority: boolean
  useSquareImage: boolean
}

function GridArticleCard({
  article,
  isPriority,
  useSquareImage,
}: GridArticleCardProps): JSX.Element {
  const imageUrl = useSquareImage
    ? (article.imageUrlSquare ?? article.imageUrl ?? null)
    : (article.imageUrl ?? article.imageUrlSquare ?? null)
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
      <div
        className={`${useSquareImage ? 'aspect-square' : 'aspect-[16/10]'} overflow-hidden bg-[#d7dcde]`}
      >
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
      </div>

      <div className="pt-4 flex flex-col flex-1">
        <p className="font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase leading-none tracking-[0.12em] text-[#1e3599] 768:text-[0.67rem]">
          {articleTypeLabel}
        </p>

        <h3 className="mt-2 font-editorial text-[1.35rem] font-semibold leading-[1.1] text-[#1a1a1a]">
          {article.title}
        </h3>

        {excerpt ? (
          <p className="mt-2 overflow-hidden font-editorial text-[0.88rem] font-normal leading-[1.5] text-[#3f3a35] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
            {excerpt}
          </p>
        ) : null}

        <p className="mt-auto pt-3 font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[#5f5952] 768:text-[0.65rem]">
          By{' '}
          <AuthorLink
            authorSlug={article.author?.slug}
            authorId={article.author?.id}
            nested
            className="hover:underline"
          >
            {authorLabel}
          </AuthorLink>
        </p>
      </div>
    </>
  )

  return articlePath ? (
    <Link href={articlePath} className="flex flex-col">
      {inner}
    </Link>
  ) : (
    <article className="flex flex-col">{inner}</article>
  )
}

export function ArticleGridPreview({
  block,
}: HomepageBlockLayoutProps<ArticleGridBlock>): JSX.Element | null {
  const items = block.items ?? []

  const heading = block.sectionHeading?.trim() || null
  const subheading = block.sectionSubheading?.trim() || null

  if (items.length === 0) return null

  // 4 slots render either a wide four-across strip or a 2×2 square grid
  // (server sends articleGridFourLayout only for 4-slot blocks); 8 slots
  // always render four across, wrapping onto a second row.
  const isTwoByTwo = block.totalSlots === 4 && block.articleGridFourLayout === 'two-by-two'
  const usesSquareCards = block.totalSlots === 8 || isTwoByTwo
  const gridClass = isTwoByTwo
    ? 'grid grid-cols-1 768:grid-cols-2 gap-x-3 gap-y-8'
    : 'grid grid-cols-1 768:grid-cols-2 1024:grid-cols-4 gap-x-3 gap-y-8'

  return (
    <BlockSection className="py-8 bg-[#f5f0e8]" aria-label="Article grid">
      {heading ? (
        <div className="mb-5">
          <h2 className="font-editorial font-semibold leading-tight text-[#1a1a1a] text-[1.4rem] 768:text-[1.7rem] 1024:text-[2rem] 1280:text-[2.3rem]">
            {heading}
          </h2>
          {subheading ? (
            <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.75rem] 768:text-[0.85rem] 1024:text-[0.9rem] text-[#3f3a35] leading-relaxed">
              {subheading}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={gridClass}>
        {items.map((article, index) => (
          <GridArticleCard
            key={getArticleKey(article, index)}
            article={article}
            isPriority={index === 0}
            useSquareImage={usesSquareCards}
          />
        ))}
      </div>
    </BlockSection>
  )
}
